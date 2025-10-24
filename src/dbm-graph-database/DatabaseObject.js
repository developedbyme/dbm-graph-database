import Dbm from "dbm";

export default class DatabaseObject {
    constructor() {
        this._id = 0;
        Object.defineProperty(this, "_database", {value: null, enumerable: false, writable: true, configurable: true});
    }

    setup(aDatabase, aId) {
        this._id = aId;
        this._database = aDatabase;

        return this;
    }

    get id() {
        return this._id;
    }

    async getIdentifier() {
        return await this._database.getObjectIdentifier(this.id);
    }

    async setIdentifier(aIdentifier) {
        await this._database.setObjectIdentifier(this.id, aIdentifier);
    }

    async getFields() {
        return await this._database.getFields(this.id);
    }

    async getFieldTranslation(aFieldName) {
        return await this._database.getFieldTranslation(this.id, aFieldName);
    }

    async getAllFieldTranslations() {
        return await this._database.getAllFieldTranslations(this.id);
    }

    async objectRelationQuery(aPath) {
        let ids = await this._database.objectRelationQuery([this.id], aPath);
        return this._database.getObjects(ids);
    }

    async singleObjectRelationQuery(aPath) {
        let ids = await this._database.objectRelationQuery([this.id], aPath);
        if(ids.length) {
            return this._database.getObject(ids[0]);
        }

        return null;
    }

    async singleObjectRelationQueryWithFieldFilter(aPath, aName, aValue) {
        let ids = await this._database.objectRelationQuery([this.id], aPath);
        if(ids.length) {

            ids = await this._database.fieldFilter(ids, aName, aValue);

            if(ids.length) {
                return this._database.getObject(ids[0]);
            }
        }

        return null;
    }

    async singleObjectRelationQueryWithIdentifierFilter(aPath, aIdentifier) {
        let ids = await this._database.objectRelationQuery([this.id], aPath);
        if(ids.length) {

            ids = await this._database.identifierFilter(ids, aIdentifier);

            if(ids.length) {
                return this._database.getObject(ids[0]);
            }
        }

        return null;
    }

    async updateField(aName, aValue) {
        await this._database.updateField(this.id, aName, aValue);

        return this;
    }

    async updateFieldTranslation(aName, aLanguage, aValue) {
        await this._database.updateFieldTranslation(this.id, aName, aLanguage, aValue);

        return this;
    }

    async addOutgoingRelation(aIdOrPost, aType, aStartAt = "NOW()", aEndAt = null) {
        let id = this._idFromPostOrId(aIdOrPost);

        if(!id) {
            return null;
        }

        let relation = await this._database.createRelation(this.id, aType, id, aStartAt, aEndAt);

        return relation;
    }

    async addIncomingRelation(aIdOrPost, aType, aStartAt = "NOW()", aEndAt = null) {
        let id = this._idFromPostOrId(aIdOrPost);

        if(!id) {
            return null;
        }

        let relation = this._database.createRelation(id, aType, this.id, aStartAt, aEndAt);

        return relation;
    }

    async replaceOutgoingRelation(aIdOrPost, aType, aObjectType, aEndAt = null) {
        let id = this._idFromPostOrId(aIdOrPost);

        let relationId = 0;
        let hasRelation = false;
        let objects = await this._database.getRelations([this.id], "out", aType, aObjectType);
        if(objects.length) {
            let currentArray = objects;
            let currentArrayLength = currentArray.length;
            for(let i = 0; i < currentArrayLength; i++) {
                let relatedObject = currentArray[i];
                if(relatedObject.id === id && relatedObject.endAt === aEndAt && !hasRelation) {
                    hasRelation = true;
                    relationId = relatedObject.relationId;
                }
                else {
                    await this._database.endRelation(relatedObject.relationId);
                }
            }
        }

        if(!hasRelation) {
            if(aIdOrPost) {

            }
            relationId = await this.addOutgoingRelation(id, aType, "NOW()", aEndAt);
        }

        return relationId;
    }

    async replaceIncomingRelation(aIdOrPost, aType, aObjectType, aEndAt = null) {
        let id = this._idFromPostOrId(aIdOrPost);

        let relationId = 0;
        let hasRelation = false;
        let objects = await this._database.getRelations([this.id], "in", aType, aObjectType);
        if(objects.length) {
            let currentArray = objects;
            let currentArrayLength = currentArray.length;
            for(let i = 0; i < currentArrayLength; i++) {
                let relatedObject = currentArray[i];
                if(relatedObject.id === id && relatedObject.endAt === aEndAt && !hasRelation) {
                    hasRelation = true;
                    relationId = relatedObject.relationId;
                }
                else {
                    await this._database.endRelation(relatedObject.relationId);
                }
            }
        }

        if(!hasRelation) {
            relationId = await this.addIncomingRelation(id, aType, "NOW()", aEndAt);
        }
        return relationId;
    }

    async replaceMultipleIncomingRelations(aIdsOrPosts, aType, aObjectType, aEndAt = null) {

        let idsToAdd = [];
        let removedIds = [];

        let ids = this._idsFromPostsOrIds(aIdsOrPosts);
        let exisitngIds = [];
        let objects = await this._database.getRelations([this.id], "in", aType, aObjectType);
        if(objects.length) {
            {
                let currentArray = objects;
                let currentArrayLength = currentArray.length;
                for(let i = 0; i < currentArrayLength; i++) {
                    let relatedObject = currentArray[i];
                    if(ids.indexOf(relatedObject.id) >= 0 && relatedObject.endAt === aEndAt) {
                        exisitngIds.push(relatedObject.id);
                    }
                    else {
                        removedIds.push(relatedObject.id);
                        await this._database.endRelation(relatedObject.relationId);
                    }
                }
            }
        }

        {
            idsToAdd = Dbm.utils.ArrayFunctions.getUnselectedItems(exisitngIds, ids);

            let currentArray = idsToAdd;
            let currentArrayLength = currentArray.length;
            for(let i = 0; i < currentArrayLength; i++) {
                let relationId = await this.addIncomingRelation(currentArray[i], aType, "NOW()", aEndAt);
            }
        }

        return {"added": idsToAdd, "exisitng": exisitngIds, "removed": removedIds};
    }

    async replaceMultipleOutgoingRelations(aIdsOrPosts, aType, aObjectType, aEndAt = null) {

        let idsToAdd = [];
        let removedIds = [];

        let ids = this._idsFromPostsOrIds(aIdsOrPosts);
        let exisitngIds = [];
        let objects = await this._database.getRelations([this.id], "out", aType, aObjectType);
        if(objects.length) {
            {
                let currentArray = objects;
                let currentArrayLength = currentArray.length;
                for(let i = 0; i < currentArrayLength; i++) {
                    let relatedObject = currentArray[i];
                    if(ids.indexOf(relatedObject.id) >= 0 && relatedObject.endAt === aEndAt) {
                        exisitngIds.push(relatedObject.id);
                    }
                    else {
                        removedIds.push(relatedObject.id);
                        await this._database.endRelation(relatedObject.relationId);
                    }
                }
            }
        }

        {
            idsToAdd = Dbm.utils.ArrayFunctions.getUnselectedItems(exisitngIds, ids);

            let currentArray = idsToAdd;
            let currentArrayLength = currentArray.length;
            for(let i = 0; i < currentArrayLength; i++) {
                let relationId = await this.addOutgoingRelation(currentArray[i], aType, "NOW()", aEndAt);
            }
        }

        return {"added": idsToAdd, "exisitng": exisitngIds, "removed": removedIds};
    }

    async removeIncomingRelationTo(aIdOrPost, aType) {
        let id = this._idFromPostOrId(aIdOrPost);

        let objects = await this._database.getRelations([this.id], "in", aType, "*");
        if(objects.length) {
            let currentArray = objects;
            let currentArrayLength = currentArray.length;
            for(let i = 0; i < currentArrayLength; i++) {
                let relatedObject = currentArray[i];
                if(relatedObject.id === id) {
                    await this._database.endRelation(relatedObject.relationId);
                }
            }
        }
    }

    async removeOutgoingRelationTo(aIdOrPost, aType) {
        let id = this._idFromPostOrId(aIdOrPost);

        let objects = await this._database.getRelations([this.id], "out", aType, "*");
        if(objects.length) {
            let currentArray = objects;
            let currentArrayLength = currentArray.length;
            for(let i = 0; i < currentArrayLength; i++) {
                let relatedObject = currentArray[i];
                if(relatedObject.id === id) {
                    await this._database.endRelation(relatedObject.relationId);
                }
            }
        }
    }

    async setUrl(aUrl) {
        let isSet = await this._database.updateUrl(this.id, aUrl);

        return isSet;
    }

    async getUrl() {
        let url = await this._database.getUrl(this.id);

        return url;
    }

    async setVisibility(aVisibility) {
        await this._database.setObjectVisibility(this.id, aVisibility);
    }

    async getVisibility() {
        return await this._database.getObjectVisibility(this.id);
    }

    async getObjectTypes() {
        let types = await this._database.getObjectTypesForObject(this.id);

        return Dbm.utils.ArrayFunctions.mapField(types, "name");
    }

    async addObjectType(aType) {
        await this._database.addObjectType(this.id, aType);
    }

    async removeObjectType(aType) {
        await this._database.removeObjectType(this.id, aType);
    }

    _idFromPostOrId(aIdOrPost) {
        if(aIdOrPost instanceof DatabaseObject) {
            return aIdOrPost.id;
        }

        let numericId = 1*aIdOrPost;
        if(aIdOrPost && !isNaN(1*numericId)) {
            return numericId
        }

        return 0;
    }

    _idsFromPostsOrIds(aIdsOrPosts) {
        
        let currentArray = aIdsOrPosts;
        let currentArrayLength = currentArray.length;
        let ids = new Array(currentArrayLength);
        for(let i = 0; i < currentArrayLength; i++) {
            ids[i] = this._idFromPostOrId(currentArray[i]);
        }

        return ids;
    }

    async getSingleLinkedType(aType) {
        let type = await this.singleObjectRelationQuery("in:for:" + aType);
        if(type) {
            let identifier = await type.getIdentifier();
            return identifier;
        }

        return null;
    }

    async addLinkedType(aObjectType, aIdentifier) {
        let objectType = await this._database.getTypeObject(aObjectType, aIdentifier);
        await this.addIncomingRelation(objectType, "for");

        return this;
    }

    async trash() {
        await this._database.trashItem(this.id);
    }
}