import DatabaseObject from "./DatabaseObject.js";

import * as crypto from "node:crypto";

export default class User extends DatabaseObject {
    constructor() {
        super();

        this._personalSalt = null;
    }

    async setUsername(aUsername) {
        
        let query = "UPDATE Users SET username = " + this._database.connection.escape(aUsername) + " WHERE object = " + this.id;
		let result = await this._database.connection.query(query);
    }

    async getUsername() {
        
        let query = "SELECT username FROM Users WHERE object = " + this.id;
		let result = await this._database.connection.query(query);

        return result[0][0].username;
    }

    async setPassword(aPassword) {
        let salt = this._database.salt;
		let personalSalt = await this.getPersonalSalt();

		let userId = this.id;
		let password = aPassword;

		let fullSalt = userId + ":" + salt + ":" + personalSalt;

        let hashedPassword = await new Promise((resolve, reject) => {
            crypto.scrypt(password, fullSalt, 64, function(aError, aDerivedKey) {
                if(aError) {
                    reject(aError);
                }
                resolve(aDerivedKey.toString('hex'));
            });
        });

        let query = "UPDATE Users SET password = '" + hashedPassword + "' WHERE object = " + userId;
		let result = await this._database.connection.query(query);
    }

    async verifyPassword(aPassword) {
        let salt = this._database.salt;
		let personalSalt = await this.getPersonalSalt();

		let userId = this.id;
		let password = aPassword;

		let fullSalt = userId + ":" + salt + ":" + personalSalt;

        let hashedPassword = await new Promise((resolve, reject) => {
            crypto.scrypt(password, fullSalt, 64, function(aError, aDerivedKey) {
                if(aError) {
                    reject(aError);
                }
                resolve(aDerivedKey.toString('hex'));
            });
        });

        let query = "SELECT password as password FROM Users WHERE object = " + userId + " LIMIT 1";
		let result = await this._database.connection.query(query);

        if(result[0].length) {
            return result[0][0].password === hashedPassword;
        }

        return false;
    }

    async getPersonalSalt() {

        if(!this._personalSalt) {
            let query = "SELECT salt as salt FROM Users WHERE object = " + this.id + " LIMIT 1";

            let result = await this._database.connection.query(query);
    
            if(result[0].length) {
                this._personalSalt = result[0][0].salt;
            }
        }

        return this._personalSalt;
    }

    async _generatePublicSesssionId(aSessionId, aExpiry, aToken) {

        let salt = this._database.salt;
		let personalSalt = await this.getPersonalSalt();

        let expiry = (new Date(aExpiry)).toISOString().split("T").join(" ").substring(0, 19);

        let tokenToEncode = aSessionId + ":" + this.id + ":" + expiry + ":" + aToken;
		let fullSalt = this.id + ":" + salt + ":" + personalSalt;

        let hashedToken = await new Promise((resolve, reject) => {
            crypto.scrypt(tokenToEncode, fullSalt, 64, function(aError, aDerivedKey) {
                if(aError) {
                    reject(aError);
                }
                resolve(aDerivedKey.toString('hex'));
            });
        });

        let publicSessionId = aSessionId + ":" + this.id + ":" + (new Date(expiry + "Z")).valueOf() + ":" + hashedToken;

        return publicSessionId;
    }

    async createSession() {

        let idType = await this._database.getIdType("userSession");
        let sessionId = await this._database.createId(idType);

        let userId = this.id;
		let token = crypto.randomBytes(32).toString('hex');

        let expiryLength = 24*3600;

        let expiryDate =(new Date((new Date()).valueOf()+expiryLength*1000));
        let expiry = expiryDate.toISOString().split("T").join(" ").substring(0, 19);

        let publicSessionId = await this._generatePublicSesssionId(sessionId, expiryDate.valueOf(), token);

        let query = "INSERT INTO Sessions (id, user, token, expiry) VALUES (" + sessionId + ", " + userId + ", '" + token + "', '" + expiry + "')";
		let result = await this._database.connection.query(query);
		
        return publicSessionId;
    }

    async verifySession(aPublicSessionId) {
        let [sessionId, userId, expiry, hashedToken] = aPublicSessionId.split(":");

        sessionId *= 1;
        userId *= 1;

        expiry = new Date(1*expiry);
        let now = new Date();
        if(expiry.valueOf() < now.valueOf()) {
            return false;
        }
        if(userId !== this.id) {
            return false;
        }

        let query = "SELECT user as user, expiry as expiry, token as token FROM Sessions WHERE id = " + sessionId + " LIMIT 1";
        let result = await this._database.connection.query(query);

        if(result[0].length) {
            let row = result[0][0];
            if(userId !== row.user) {
                return false;
            }

            //console.log(expiry.toISOString().split("T").join(" ").substring(0, 19), row.expiry);
            if(expiry.toISOString().split("T").join(" ").substring(0, 19) !== row.expiry) {
                return false;
            }

            let storedSessionId = await this._generatePublicSesssionId(sessionId, expiry.valueOf(), row.token);

            if(aPublicSessionId === storedSessionId) {
                return true;
            }
        }
        
        return false;
    }

    async generateSignedSessionToken(aSessionId, aExpiry, aToken, aSecret) {

        let salt = this._database.salt;
		let personalSalt = await this.getPersonalSalt();

        let expiry = (new Date(aExpiry)).toISOString().split("T").join(" ").substring(0, 19);

        let tokenToEncode = aSessionId + ":" + this.id + ":" + expiry + ":" + aToken + ":" + aSecret;
		let fullSalt = this.id + ":" + salt + ":" + personalSalt;

        let hashedToken = await new Promise((resolve, reject) => {
            crypto.scrypt(tokenToEncode, fullSalt, 64, function(aError, aDerivedKey) {
                if(aError) {
                    reject(aError);
                }
                resolve(aDerivedKey.toString('base64'));
            });
        });

        let signedToken = aSessionId + ":" + this.id + ":" + (new Date(expiry + "Z")).valueOf() + ":" + aToken + ":" + hashedToken;

        return signedToken;
    }

    async verifySignedSessionToken(aSignedToken) {
        //console.log("verifySignedSessionToken");

        let [sessionId, userId, expiry, token, signature] = aSignedToken.split(":");

        sessionId *= 1;
        userId *= 1;

        expiry = new Date(1*expiry);
        
        let now = new Date();
        if(expiry < now.valueOf()) {
            console.log("Expired");
            return false;
        }
        if(userId !== this.id) {
            console.log("Incorrect user");
            return false;
        }

        let query = "SELECT user as user, expiry as expiry, token as token FROM Sessions WHERE id = " + sessionId + " LIMIT 1";
        let result = await this._database.connection.query(query);

        if(result[0].length) {
            let row = result[0][0];
            if(this.id !== row.user) {
                console.log("Incorrect user 2");
                return false;
            }

            let storedSessionId = await this._generatePublicSesssionId(sessionId, (new Date(row.expiry + "Z")).valueOf(), row.token);
            let storedFullToken = await this.generateSignedSessionToken(sessionId, expiry.valueOf(), token, storedSessionId);

            //console.log(storedSessionId, storedFullToken, aSignedToken);
            if(storedFullToken === aSignedToken) {
                return true;
            }
        }

        return false;
    }
}