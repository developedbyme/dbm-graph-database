export default class DatabaseObject {
    constructor() {
        this._id = 0;
        this._database = null;
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
        this._database.updateField(this.id, aName, aValue);

        return this;
    }

    async addOutgoingRelation(aIdOrPost, aType, aStartAt = "NOW()", aEndAt = null) {
        let id = this._idFromPostOrId(aIdOrPost);

        this._database.createRelation(this.id, aType, id, aStartAt, aEndAt);

        return this;
    }

    async addIncomingRelation(aIdOrPost, aType, aStartAt = "NOW()", aEndAt = null) {
        let id = this._idFromPostOrId(aIdOrPost);

        this._database.createRelation(id, aType, this.id, aStartAt, aEndAt);

        return this;
    }

    async setUrl(aUrl) {
        let isSet = await this._database.updateUrl(this.id, aUrl);

        return isSet;
    }

    async getUrl() {
        let url = await this._database.getUrl(this.id);

        return url;
    }

    _idFromPostOrId(aIdOrPost) {
        if(aIdOrPost instanceof DatabaseObject) {
            return aIdOrPost.id;
        }

        return aIdOrPost;
    }
}