import Dbm from "dbm";
import mysql from 'mysql2/promise';
import * as crypto from "node:crypto";

import DatabaseObject from "./DatabaseObject.js";
import User from "./User.js";

export default class Database extends Dbm.core.BaseObject {
    constructor() {
        super();

        this.connection = null;
        this._host = null;
        this._user = null;
        this._password = null;
        this._database = null;

        this.directionColumns = {
            "out": {
                "thisColumn": "fromObject",
                "relatedColumn": "toObject"
            },
            "in": {
                "thisColumn": "toObject",
                "relatedColumn": "fromObject"
            }
        }

        this.salt = '=t]j4a{zv&Qqc:A_5ug;5uo#IT#5xfO@|SC((+6`fEUg`IwC+O=G/9DK,&m_!9`,';
    }

    async setConnection(aHost, aUser, aPassword, aDatabase) {

        this._host = aHost;
        this._user = aUser;
        this._password = aPassword;
        this._database = aDatabase;

        this.connection = mysql.createPool({
            host: this._host,
            user: this._user,
            password: this._password,
            database: this._database,
            dateStrings: true,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        return this;
    }

    restartConnection() {

        if(this.connection) {
            this.connection.end();
            this.connection = null;
        }

        this.connection = mysql.createPool({
            host: this._host,
            user: this._user,
            password: this._password,
            database: this._database,
            dateStrings: true,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        return this;
    }

    async testConnection() {
        try {
            await this.connection.query('SELECT 1');
            return true;
        }
        catch(theError) {
            return false;
        }
    }

    async createId(aIdTypeId) {
		let result = await this.connection.query("INSERT INTO Ids (id, type) VALUES (NULL, " + aIdTypeId + ")");

		return result[0].insertId;
	}

	async insertIdType(aName) {
		let idTypeId = 1; 
		let id = await this.createId(idTypeId);

		let query = "INSERT INTO IdTypes (id, name) VALUES (" + id + ", " + this.connection.escape(aName) + ")";
		let result = await this.connection.query(query);

		return id;
	}

	async getIdType(aName) {
		let query = "SELECT id FROM IdTypes WHERE name = " + this.connection.escape(aName) + "";
		let result = await this.connection.query(query);
		let rows = result[0];

		if(rows.length) {
			return rows[0].id;
		}
		else {
			return await this.insertIdType(aName);
		}
	}

	async createType(aName, aTable, aObjectType) {
		let query = "SELECT id FROM " + aTable + " WHERE name = " + this.connection.escape(aName) + "";
		let result = await this.connection.query(query);
		let rows = result[0];

		if(rows.length) {
			return rows[0].id;
		}
		else {

			let typeId = await this.getIdType(aObjectType); 
			let id = await this.createId(typeId);
	
			let query = "INSERT INTO " + aTable + " (id, name) VALUES (" + id + ", " + this.connection.escape(aName) + ")";
			let result = await this.connection.query(query);

			return id;
		}
	}

	async getObjectType(aName) {
		return await this.createType(aName, "ObjectTypes", "objectType");
	}

	async getVisibilityType(aName) {
		return await this.createType(aName, "Visibilities", "visibility");
	}

	async getRelationType(aName) {
		return await this.createType(aName, "RelationTypes", "relationType");
	}

	async addObjectType(aObjectId, aType) {
		let objectTypeId = await this.getObjectType(aType);
		let table = "ObjectTypesLink";

		let query = "INSERT INTO " + table + " (id, type) VALUES (" + aObjectId + ", " + objectTypeId + ")";
		let result = await this.connection.query(query);
        return result;
	}

    async removeObjectType(aObjectId, aType) {
		let objectTypeId = await this.getObjectType(aType);
		let table = "ObjectTypesLink";

		let query = "DELETE FROM " + table + " WHERE id = " + aObjectId + " AND type =" + objectTypeId;
		let result = await this.connection.query(query);
        return result;
	}

	async createObject(aVisibility, aTypes) {
		let typeId = await this.getIdType('object');
		let table = "Objects";
		
		let id = await this.createId(typeId);

        if(typeof(aVisibility) === "string") {
            aVisibility = await this.getVisibilityType(aVisibility);
        }

		let query = "INSERT INTO " + table + " (id, visibility) VALUES (" + id + ", " + aVisibility + ")";
		let result = await this.connection.query(query);

		let currentArray = aTypes;
		let currentArrayLength = currentArray.length;
		for(let i = 0; i < currentArrayLength; i++) {
			let currentType = currentArray[i];
			await this.addObjectType(id, currentType);
		}

		return this.getObject(id);
	}

    async setObjectVisibility(aId, aVisibility) {
        if(typeof(aVisibility) === "string") {
            aVisibility = await this.getVisibilityType(aVisibility);
        }

        let table = "Objects";
        let query = "UPDATE " + table + " SET visibility = " + aVisibility + " WHERE id = " + this.connection.escape(aId);
        let result = await this.connection.query(query);
    }

    async getObjectVisibility(aId) {
        let query = "SELECT Visibilities.name as name FROM Visibilities INNER JOIN Objects ON Objects.visibility = Visibilities.id WHERE Objects.id = " + this.connection.escape(aId) + " LIMIT 1";

        let result = await this.connection.query(query);
        let rows = result[0];

        if(rows.length) {
			return rows[0].name;
		}

        return null;
    }

    _getUtcDate(aDate) {
        if(aDate instanceof Date) {
            let tempArray = aDate.toISOString().split("T");
            return tempArray[0] + " " + tempArray[1].split(".")[0];
        }

        return aDate;
    }

	async createRelation(aFrom, aType, aTo, aStartAt = "NOW()", aEndAt = null) {
		let typeId = await this.getIdType('relation');
		let table = "Relations";
		
		let id = await this.createId(typeId);
		let relationTypeId = await this.getRelationType(aType);

        if(aStartAt === null ) {
            aStartAt = "NULL";
        }
        else if(aStartAt !== "NOW()") {
            aStartAt = this.connection.escape(this._getUtcDate(aStartAt));
        }

        if(aEndAt === null ) {
            aEndAt = "NULL";
        }
        else {
            aEndAt = this.connection.escape(this._getUtcDate(aEndAt));
        }

		let query = "INSERT INTO " + table + " (id, fromObject, type, toObject, startAt, endAt) VALUES (" + id + ", " + this.connection.escape(aFrom) + ", " + relationTypeId + ", " + this.connection.escape(aTo) + ", " + aStartAt + ", " + aEndAt + ")";
		let result = await this.connection.query(query);

		return id;
	}

    async endRelation(aId, aTime = "NOW()") {
        let table = "Relations";
        let query = "UPDATE " + table + " SET endAt = " + aTime + " WHERE id = " + this.connection.escape(aId);
		let result = await this.connection.query(query);
    }

    async getTypeObject(aObjectType, aIdentifier, aDefaultVisibility = "public") {
        let objectTypeId = await this.getObjectType(aObjectType);

        let query = "SELECT Objects.id as id FROM Objects INNER JOIN Identifiers ON Objects.id = Identifiers.object INNER JOIN ObjectTypesLink ON Objects.id = ObjectTypesLink.id WHERE ObjectTypesLink.type = " + objectTypeId + " AND Identifiers.identifier = " + this.connection.escape(aIdentifier) + " LIMIT 1";

		let result = await this.connection.query(query);
		let rows = result[0];

		if(rows.length) {
			return this.getObject(rows[0].id);
		}
		else {
            let object = await this.createObject(aDefaultVisibility, [aObjectType]);
            await object.setIdentifier(aIdentifier);
            await object.updateField("name", aIdentifier);

            return object;
        }
    }

    async getIdentifiableObject(aObjectType, aIdentifier, aDefaultVisibility = "private") {
        let object = await this.getIdentifiableObjectIfExists(aObjectType, aIdentifier);

		if(!object) {
            object = await this.createObject(aDefaultVisibility, [aObjectType]);
            await object.setIdentifier(aIdentifier);
        }
        return object;
    }

    async getIdentifiableObjectIfExists(aObjectType, aIdentifier) {
        let objectTypeId = await this.getObjectType(aObjectType);

        let query = "SELECT Objects.id as id FROM Objects INNER JOIN Identifiers ON Objects.id = Identifiers.object INNER JOIN ObjectTypesLink ON Objects.id = ObjectTypesLink.id WHERE ObjectTypesLink.type = " + objectTypeId + " AND Identifiers.identifier = " + this.connection.escape(aIdentifier) + " LIMIT 1";

		let result = await this.connection.query(query);
		let rows = result[0];

		if(rows.length) {
			return this.getObject(rows[0].id);
		}

        return null;
    }

    getObject(aId) {
        let newObject = new DatabaseObject();
        newObject.setup(this, aId);

        return newObject;
    }

    getUser(aId) {
        let newObject = new User();
        newObject.setup(this, aId);

        return newObject;
    }

    async getUserByUsername(aUsername) {
        let query = "SELECT object as id FROM Users WHERE username = " + this.connection.escape(aUsername) + " LIMIT 1";
        let result = await this.connection.query(query);

        if(result[0].length) {
            return this.getUser(result[0][0].id);
        }

        return null;
    }

    getObjects(aIds) {

        let currentArray = aIds;
        let currentArrayLength = currentArray.length;

        let returnArray = new Array(currentArrayLength);
        for(let i = 0; i < currentArrayLength; i++) {
            returnArray[i] = this.getObject(currentArray[i]);
        }

        return returnArray;
    }
	
	async getObjectsOfType(aType, aVisibility = "public") {
		
		let objectTypeId = await this.getObjectType(aType);
		
		let query = "SELECT Objects.id as id from Objects INNER JOIN ObjectTypesLink ON Objects.id = ObjectTypesLink.id WHERE ObjectTypesLink.type = " + objectTypeId;
		
		if(aVisibility !== "*") {
			let visibilityId = await this.getVisibilityType(aVisibility);
			query += " AND Objects.visibility = " + visibilityId; 
		}
		
		let result = await this.connection.query(query);
		
        let currentArray = result[0];
        let currentArrayLength = currentArray.length;

        let returnArray = new Array(currentArrayLength);
        for(let i = 0; i < currentArrayLength; i++) {
            returnArray[i] = this.getObject(currentArray[i].id);
        }
		
		return returnArray;
		
		
	}

    async getObjectIdentifier(aObjectId) {
        let query = "SELECT identifier as identifier FROM Identifiers WHERE object = " + this.connection.escape(aObjectId) + " LIMIT 1";

        //console.log(query);
        let result = await this.connection.query(query);

        if(result[0].length) {
            return result[0][0].identifier;
        }

        return null;
        
    }

    async setObjectIdentifier(aId, aIdentifier) {
        
        let query = "INSERT INTO Identifiers (object, identifier) VALUES (" + aId + ", " + this.connection.escape(aIdentifier) + ")";

        //console.log(query);
        let result = await this.connection.query(query);

        return null;
        
    }

    async getRelations(aFromIds, aDirection, aType, aObjectType = "*", aTime = "NOW()") {
        if(!aFromIds.length) {
            return [];
        }

        let columns = this.directionColumns[aDirection];
        let typeId = await this.getRelationType(aType); //METODO: do not create new types
        let idsString = aFromIds.join(",");

        let query;
        if(aObjectType === "*") {
            query = "SELECT Relations." + columns["thisColumn"] + " as fromId, Relations.id as relationId, Objects.id as id, Relations.startAt as startAt, Relations.endAt as endAt FROM Objects INNER JOIN Relations ON Objects.id = Relations." + columns["relatedColumn"] + " WHERE Relations.type = " + typeId + " AND Relations." + columns["thisColumn"] + " IN (" + idsString + ")";
        }
        else {
            let objectTypeId = await this.getObjectType(aObjectType); //METODO: do not create new types
            query = "SELECT Relations." + columns["thisColumn"] + " as fromId, Relations.id as relationId, Objects.id as id, Relations.startAt as startAt, Relations.endAt as endAt FROM Objects INNER JOIN Relations ON Objects.id = Relations." + columns["relatedColumn"] + " INNER JOIN ObjectTypesLink ON Objects.id = ObjectTypesLink.id WHERE Relations.type = " + typeId + " AND Relations." + columns["thisColumn"] + " IN (" + idsString + ") AND ObjectTypesLink.type = " + objectTypeId + "";
        }

        if(aTime !== null) {
             query += " AND (Relations.startAt <= " + aTime + " OR Relations.startAt IS NULL) AND (Relations.endAt > " + aTime + " OR Relations.endAt IS NULL)";
        }

        let result = await this.connection.query(query);
        let rows = result[0];

        //let returnArray = rows.map(function(aRow) {return {"id": aRow.id, "relationId": aRow.relationId, "fromId": aRow.fromId}});

        return rows;
    }

    async getAllRelations(aId) {

        let returnObject = {};

        {
            let query = "SELECT Relations.id as relationId, Relations.toObject as id, Relations.startAt as startAt, Relations.endAt as endAt, RelationTypes.name as type FROM Relations INNER JOIN RelationTypes ON Relations.type = RelationTypes.id WHERE Relations.fromObject = " + aId;

            let result = await this.connection.query(query);
            let rows = result[0];
    
            returnObject["out"] =  rows;
        }

        {
            let query = "SELECT Relations.fromObject as id, Relations.id as relationId, Relations.startAt as startAt, Relations.endAt as endAt, RelationTypes.name as type FROM Relations INNER JOIN RelationTypes ON Relations.type = RelationTypes.id WHERE Relations.toObject = " + aId;

            let result = await this.connection.query(query);
            let rows = result[0];
    
            returnObject["in"] =  rows;
        }

        return returnObject;
    }

    async runObjectRelationQuery(aFromIds, aDirection, aType, aObjectType = "*", aTime = "NOW()") {
        //console.log("runObjectRelationQuery");
        
        if(!aFromIds.length) {
            return [];
        }

        let columns = this.directionColumns[aDirection];
        let typeId = await this.getRelationType(aType); //METODO: do not create new types
        let idsString = aFromIds.join(",");

        let query;
        if(aObjectType === "*") {
            query = "SELECT DISTINCT(Objects.id) as id FROM Objects INNER JOIN Relations ON Objects.id = Relations." + columns["relatedColumn"] + " WHERE Relations.type = " + typeId + " AND Relations." + columns["thisColumn"] + " IN (" + idsString + ")";
        }
        else {
            let objectTypeId = await this.getObjectType(aObjectType); //METODO: do not create new types
            query = "SELECT DISTINCT(Objects.id) as id FROM Objects INNER JOIN Relations ON Objects.id = Relations." + columns["relatedColumn"] + " INNER JOIN ObjectTypesLink ON Objects.id = ObjectTypesLink.id WHERE Relations.type = " + typeId + " AND Relations." + columns["thisColumn"] + " IN (" + idsString + ") AND ObjectTypesLink.type = " + objectTypeId + "";
        }

        if(aTime !== null) {
             query += " AND (Relations.startAt <= " + aTime + " OR Relations.startAt IS NULL) AND (Relations.endAt > " + aTime + " OR Relations.endAt IS NULL)";
        }

        let result = await this.connection.query(query);
        let rows = result[0];

        let returnArray = rows.map(function(aRow) {return aRow.id});

        return returnArray;
    }

    async objectRelationQuery(aFromIds, aPath) {
        let currentIds = aFromIds;
        let currentArray = aPath.split(",");
        let currentArrayLength = currentArray.length;
        for(let i = 0; i < currentArrayLength; i++) {
            let currentPath = currentArray[i].split(":");
            let time = "NOW()";
            if(currentPath.length > 3) {
                if(currentPath[3] === "*") {
                    time = null;
                }
                else {
                    let date = new Date(1*currentPath[3]);
                    let time = date.toISOString();
                }
            }

            currentIds = await this.runObjectRelationQuery(currentIds, currentPath[0], currentPath[1], currentPath[2], time);
        }

        return currentIds;
    }

    async fieldFilter(aIds, aName, aValue) {
        let query = "SELECT object as id FROM Fields WHERE object IN (" + aIds.join(",") + ") AND name = " + this.connection.escape(aName) + " AND value = " + this.connection.escape(JSON.stringify(aValue));

        let result = await this.connection.query(query);
        let rows = result[0];

        let returnArray = rows.map(function(aRow) {return aRow.id});

        return returnArray;
    }

    async identifierFilter(aIds, aIdentifier) {
        let query = "SELECT object as id FROM Identifiers WHERE object IN (" + aIds.join(",") + ") AND identifier = " + this.connection.escape(aIdentifier);

        let result = await this.connection.query(query);
        let rows = result[0];

        let returnArray = rows.map(function(aRow) {return aRow.id});

        return returnArray;
    }

    async getFields(aId) {
        let query = "SELECT name, value FROM Fields WHERE object = " + aId;

        let result = await this.connection.query(query);
        let rows = result[0];

        let returnObject = new Object();

        let currentArray = rows;
        let currentArrayLength = currentArray.length;
        for(let i = 0; i < currentArrayLength; i++) {
            let currentRow = currentArray[i];
            returnObject[currentRow["name"]] = JSON.parse(currentRow["value"]);
        }

        return returnObject;
    }

    async updateField(aId, aName, aValue) {
        let value = this.connection.escape(JSON.stringify(aValue));
        let query = "INSERT INTO Fields (object, name, value) VALUES (" + aId + ", " + this.connection.escape(aName) + ", " + value + ") ON DUPLICATE KEY UPDATE value = " + value +";";

        let result = await this.connection.query(query);

        return this;
    }

    async getObjectByUrl(aUrl) {
        let query = "SELECT object as id FROM Urls WHERE url = " + this.connection.escape(aUrl) + " LIMIT 1";

        //console.log(query);
        let result = await this.connection.query(query);

        if(result[0].length) {
            return this.getObject(result[0][0].id);
        }

        return null;
    }

    async getUrlsForNextId(aUrl) {
        let query = "SELECT url as url FROM Urls WHERE url LIKE " + this.connection.escape(aUrl + "-%");
        
        let result = await this.connection.query(query);

        return result[0].map((aItem) => {return aItem.url});
    }

    async updateUrl(aId, aUrl) {
        let url = this.connection.escape(aUrl);
        let query = "INSERT INTO Urls (object, url) VALUES (" + aId + ", " + url + ") ON DUPLICATE KEY UPDATE url = " + url +";";

        try {
            let result = await this.connection.query(query);
        }
        catch(theError) {
            return false;
        }

        return true;
    }

    async getUrl(aId) {
    
        let query = "SELECT url as url FROM Urls WHERE object = " + aId + " LIMIT 1";

        //console.log(query);
        let result = await this.connection.query(query);

        if(result[0].length) {
            return result[0][0].url;
        }

        return null;

    }

    async createUser() {
        let visibilityType = await this.getVisibilityType("private");
        let object = await this.createObject(visibilityType, ["user"]);

        let salt = this.salt;
		let personalSalt = crypto.randomBytes(8).toString('hex');

		let userId = object.id;
        let userName = "user" + userId;
		let password = crypto.randomBytes(32).toString('hex');

		let fullSalt = userId + ":" + salt + ":" + personalSalt;

        let hashedPassword = await new Promise((resolve, reject) => {
            crypto.scrypt(password, fullSalt, 64, function(aError, aDerivedKey) {
                if(aError) {
                    reject(aError);
                }
                resolve(aDerivedKey.toString('hex'));
            });
        });

        let query = "INSERT INTO Users (object, username, password, salt) VALUES (" + userId + ", '" + userName + "', '" + hashedPassword + "', '" + personalSalt + "')";
		let result = await this.connection.query(query);
		
        return this.getUser(userId);
    }

    async getObjectTypesForObject(aId) {
        let query = "SELECT ObjectTypes.id as id, ObjectTypes.name as name FROM ObjectTypes INNER JOIN ObjectTypesLink ON ObjectTypesLink.type = ObjectTypes.id WHERE ObjectTypesLink.id = " + aId;

        let result = await this.connection.query(query);

        console.log(result);

        return result[0];
    }

    async getGlobalObject(aIdentifier) {
        let globalObject = await this.getIdentifiableObjectIfExists("globalObject", aIdentifier);
        if(globalObject) {
            let linkedItem = globalObject.singleObjectRelationQuery("out:pointingTo:*");
            if(linkedItem) {
                return linkedItem;
            }
        }
        return null;
    }
}