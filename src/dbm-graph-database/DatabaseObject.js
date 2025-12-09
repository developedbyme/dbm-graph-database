import Dbm from "dbm";
import DbmGraphDatabase from "../../index.js";

export default class DatabaseObject {
    constructor() {
        this._id = 0;

        this.incomingRelations = DbmGraphDatabase.RelationsDirection.createIncoming(this);
        this.outgoingRelations = DbmGraphDatabase.RelationsDirection.createOutgoing(this);

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

    async addOutgoingRelation(aIdOrItem, aType, aStartAt = "NOW()", aEndAt = null) {
        console.warn("Use outgoingRelations.add instead of addOutgoingRelation");
        return await this.outgoingRelations.add(aIdOrItem, aType, aStartAt, aEndAt);
    }

    async addIncomingRelation(aIdOrItem, aType, aStartAt = "NOW()", aEndAt = null) {
        console.warn("Use incomingRelations.add instead of addIncomingRelation");
        return await this.incomingRelations.add(aIdOrItem, aType, aStartAt, aEndAt);
    }

    async replaceOutgoingRelation(aIdOrItem, aType, aObjectType, aEndAt = null) {
        console.warn("Use outgoingRelations.replace instead of replaceOutgoingRelation");
        return await this.outgoingRelations.replace(aIdOrItem, aType, aObjectType, aEndAt);
    }

    async replaceIncomingRelation(aIdOrItem, aType, aObjectType, aEndAt = null) {
        console.warn("Use incomingRelations.replace instead of replaceIncomingRelation");
        return await this.incomingRelations.replace(aIdOrItem, aType, aObjectType, aEndAt);
    }

    async replaceMultipleIncomingRelations(aIdsOrPosts, aType, aObjectType, aEndAt = null) {
        console.warn("Use incomingRelations.replaceMultiple instead of replaceMultipleIncomingRelations");
        return await this.incomingRelations.replaceMultiple(aIdsOrPosts, aType, aObjectType, aEndAt);
    }

    async replaceMultipleOutgoingRelations(aIdsOrPosts, aType, aObjectType, aEndAt = null) {
        console.warn("Use outgoingRelations.replaceMultiple instead of replaceMultipleOutgoingRelations");
        return await this.outgoingRelations.replaceMultiple(aIdsOrPosts, aType, aObjectType, aEndAt);
    }

    async removeIncomingRelationTo(aIdOrItem, aType) {
        console.warn("Use incomingRelations.removeRelationTo instead of removeIncomingRelationTo");
        return await this.incomingRelations.removeRelationTo(aIdOrItem, aType);
    }

    async removeOutgoingRelationTo(aIdOrItem, aType) {
        console.warn("Use outgoingRelations.removeRelationTo instead of removeOutgoingRelationTo");
        return await this.outgoingRelations.removeRelationTo(aIdOrItem, aType);
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
        await this.incomingRelations.add(objectType, "for");

        return this;
    }

    async trash() {
        await this._database.trashItem(this.id);
    }
}