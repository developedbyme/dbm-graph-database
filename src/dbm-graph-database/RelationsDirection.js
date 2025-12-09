import Dbm from "dbm";
import DbmGraphDatabase from "../../index.js";

export default class RelationsDirection {
    constructor() {
        this._owner = null;
        this._direction = RelationsDirection.OUTGOING;
    }

    setup(aOwner, aDirection) {
        this._owner = aOwner;
        this._direction = aDirection;

        return this;
    }

    _getDirectionIds(aId) {
        let returnObject = {"from": 0, "to": 0};
        if(this._direction === RelationsDirection.OUTGOING) {
            returnObject["from"] = this._owner.id;
            returnObject["to"] = aId;
        }
        else {
            returnObject["to"] = this._owner.id;
            returnObject["from"] = aId;
        }

        console.log(returnObject);

        return returnObject;
    }

    _idFromObjectOrId(aIdOrItem) {
        if(aIdOrItem instanceof DbmGraphDatabase.DatabaseObject) {
            return aIdOrItem.id;
        }

        let numericId = 1*aIdOrItem;
        if(aIdOrItem && !isNaN(1*numericId)) {
            return numericId;
        }

        return 0;
    }

    _idsFromPostsOrIds(aIdsOrPosts) {
        
        let currentArray = aIdsOrPosts;
        let currentArrayLength = currentArray.length;
        let ids = new Array(currentArrayLength);
        for(let i = 0; i < currentArrayLength; i++) {
            ids[i] = this._idFromObjectOrId(currentArray[i]);
        }

        return ids;
    }

    async add(aIdOrItem, aType, aStartAt = "NOW()", aEndAt = null) {
        //console.log("RelationsDirection::add");
        //console.log(aIdOrItem, aType, aStartAt, aEndAt);

        let id = this._idFromObjectOrId(aIdOrItem);

        if(!id) {
            return null;
        }

        let directionIds = this._getDirectionIds(id);

        let relation = await this._owner._database.createRelation(directionIds["from"], aType, directionIds["to"], aStartAt, aEndAt);

        return relation;
    }

    async _endAllRelationsExceptForObject(aId, aType, aObjectType, aEndAt = null) {
        //console.log("RelationsDirection::_endAllRelationsExceptForObject");

        let result = new Dbm.utils.ArrayOperationResult();

        let objects = await this._owner._database.getRelations([this._owner.id], this._direction, aType, aObjectType);
        let hasRelation = false;
        if(objects.length) {
            let currentArray = objects;
            let currentArrayLength = currentArray.length;
            for(let i = 0; i < currentArrayLength; i++) {
                let relatedObject = currentArray[i];
                if(relatedObject.id === aId && relatedObject.endAt === aEndAt && !hasRelation) {
                    result.noChange.push(relatedObject.relationId);
                    hasRelation = true;
                }
                else {
                    result.removed.push(relatedObject.relationId);
                    await this._owner._database.endRelation(relatedObject.relationId);
                }
            }
        }

        return result;
    }

    async replace(aIdOrItem, aType, aObjectType, aEndAt = null) {
        //console.log("RelationsDirection::replace");
        let id = this._idFromObjectOrId(aIdOrItem);

        let operationResult = await this._endAllRelationsExceptForObject(id, aType, aObjectType, aEndAt);

        if(operationResult.noChange.length === 0) {
            let relationId = await this.add(id, aType, "NOW()", aEndAt);
            operationResult.added.push(relationId);
        }

        return operationResult;
        
    }

    async replaceMultiple(aIdsOrPosts, aType, aObjectType, aEndAt = null) {

        let result = new Dbm.utils.ArrayOperationResult();

        let ids = this._idsFromPostsOrIds(aIdsOrPosts);
        let objects = await this._owner._database.getRelations([this._owner.id], this._direction, aType, aObjectType);
        if(objects.length) {
            {
                let currentArray = objects;
                let currentArrayLength = currentArray.length;
                for(let i = 0; i < currentArrayLength; i++) {
                    let relatedObject = currentArray[i];
                    if(ids.indexOf(relatedObject.id) >= 0 && relatedObject.endAt === aEndAt) {
                        result.noChange.push(relatedObject.relationId);
                    }
                    else {
                        result.removed.push(relatedObject.relationId);
                        await this._owner._database.endRelation(relatedObject.relationId);
                    }
                }
            }
        }

        {
            let currentArray = Dbm.utils.ArrayFunctions.getUnselectedItems(result.noChange, ids);
            let currentArrayLength = currentArray.length;
            for(let i = 0; i < currentArrayLength; i++) {
                let relationId = await this.add(currentArray[i], aType, "NOW()", aEndAt);
                result.added.push(relationId);
            }
        }

        return result;
    }

    async removeRelationTo(aIdOrItem, aType) {
        let id = this._idFromObjectOrId(aIdOrItem);

        let result = new Dbm.utils.ArrayOperationResult();

        let objects = await this._owner._database.getRelations([this._owner.id], this._direction, aType, "*");
        if(objects.length) {
            let currentArray = objects;
            let currentArrayLength = currentArray.length;
            for(let i = 0; i < currentArrayLength; i++) {
                let relatedObject = currentArray[i];
                if(relatedObject.id === id) {
                    result.removed.push(relatedObject.relationId);
                    await this._owner._database.endRelation(relatedObject.relationId);
                }
                else {
                    result.noChange.push(relatedObject.relationId);
                }
            }
        }

        return result;
    }

    static createIncoming(aOwner) {
        let newRelationsDirection = new RelationsDirection();
        newRelationsDirection.setup(aOwner, RelationsDirection.INCOMING);
        return newRelationsDirection;
    }

    static createOutgoing(aOwner) {
        let newRelationsDirection = new RelationsDirection();
        newRelationsDirection.setup(aOwner, RelationsDirection.OUTGOING);
        return newRelationsDirection;
    }
}

RelationsDirection.OUTGOING = "out";
RelationsDirection.INCOMING = "in";