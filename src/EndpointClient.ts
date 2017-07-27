import { Fetcher, Response } from 'hr.fetcher';
import { FormErrors } from 'hr.error';
import { Uri } from 'hr.uri';

export { Fetcher, Response };

/**
 * This interface strongly types the hal endpoint data.
 * @param {any} links
 */
interface HalData {
    _links: any,
    _embedded: any
}

/**
 * A single hal link how they appear in the collection.
 * @param {any} embeds
 */
export interface HalLink {
    href: string,
    method: string
}

/**
 * Info about a single hal link, will include the link's ref.
 * @param {any} embeds
 */
export interface HalLinkInfo {
    href: string,
    method: string,
    rel: string
}

/**
 * Documentation object for a hal link. Can be reused for any documentation lookup.
 */
export interface HalEndpointDoc {
    requestSchema: any,
    responseSchema: any,
    querySchema: any,
}

/**
 * File information for uploads. All files are uploaded with the name "files"
 */
export interface FileInfo {
    /**
     * The file name to claim for the file
     */
    fileName: string,

    /**
     * The actual file content as a blob.
     */
    data: Blob
}

export class Embed {
    private name: string;
    private embeds: HalData[];
    private fetcher: Fetcher;

    constructor(name: string, embeds: HalData[], fetcher: Fetcher) {
        this.name = name;
        this.embeds = embeds;
        this.fetcher = fetcher;
    }

    public GetAllClients(): HalEndpointClient[] {
        //No generators, create array
        var embeddedClients: HalEndpointClient[] = [];

        for (let i = 0; i < this.embeds.length; ++i) {
            var embed = new HalEndpointClient(this.embeds[i], this.fetcher);
            embeddedClients.push(embed);
        }
        return embeddedClients;
    }
}

interface ServerError {
    errors: any,
    message: string
}

export class HalError implements FormErrors {
    private errorData: ServerError;
    private statusCode: number;
    public name;
    public message;

    constructor(errorData: ServerError, statusCode: number) {
        this.errorData = errorData;
        this.statusCode = statusCode;
        this.message = errorData.message;
    }

    /**
     * Get a specific validation error. If it does not exist undefined will be retruned.
     * @param {type} name
     * @returns
     */
    getValidationError(name: string): string | undefined {
        if (this.hasValidationErrors()) {
            return this.errorData.errors[name];
        }
    }

    hasValidationError(name: string): boolean {
        if (this.hasValidationErrors()) {
            return this.errorData.errors[name] !== undefined;
        }
        return false;
    }

    getValidationErrors() {
        return this.errorData.errors;
    }

    hasValidationErrors() {
        return this.errorData.errors !== undefined;
    }

    getStatusCode() {
        return this.statusCode;
    }

    addKey(baseName: string, key: string): string {
        if(baseName !== ""){
            //Make key 1st letter uppercase to match error from server
            return baseName + "." + key[0].toUpperCase() + key.substr(1);
        }
        return key;
    }

    addIndex(baseName: string, key: string, index: string | number): string {
        return baseName + key + '[' + index + ']';;
    }
}

export interface LoadOptions {
    reqBody?: any;
    contentType?: string;
}

/**
 * This is a helper function that will make calling it in a then block
 * change the promise type to void and hides the original promise's retur
 * value. Since this is only a single instance, sharing it is slightly more
 * efficient if you are using the hal library already.
 * You can call this function if you want, it does nothing.
 */
export function makeVoid(): void{

}

/**
 * This class represents a single visit to a hal api endpoint. It will contain the data
 * that was requested and the links from that data. The hal properties are removed
 * from the data, so if you get it it won't contain that info.
 */
export class HalEndpointClient {
    private static halcyonJsonMimeType = "application/json+halcyon";
    private static jsonMimeType = "application/json";

    /**
     * Load a hal link from an endpoint.
     * @param link - The link to load
     * @param fetcher - The fetcher to use to load the link
     * @param options - Additional request options
     * @returns A HalEndpointClient for the link.
     */
    public static Load(link: HalLink, fetcher: Fetcher, options?: LoadOptions): Promise<HalEndpointClient> {
        options = options || {};

        return HalEndpointClient.LoadRaw(link, fetcher, options)
               .then(r => HalEndpointClient.processResult(r, fetcher));
    }

    private static LoadRaw(link: HalLink, fetcher: Fetcher, options?: LoadOptions): Promise<Response> {
        options = options || {};

        var headers = {
            "Accept": HalEndpointClient.halcyonJsonMimeType,
            "bearer": null //temp to get the bearer token added automatically
        };
        if (options.contentType !== undefined) {
            headers["Content-Type"] = options.contentType;
        }
        return fetcher.fetch(link.href, {
            method: link.method,
            body: options.reqBody,
            headers: headers
        });
    }

    private static processResult(response: Response, fetcher: Fetcher): Promise<HalEndpointClient> {
        return response.text().then((data) => {
            var parsedData = HalEndpointClient.parseResult(response, data);

            if (response.ok) {
                return new HalEndpointClient(parsedData, fetcher);
            }
            else {
                //Does the error look like one of our custom server errors?
                if ((<any>parsedData).message !== undefined) {
                    throw new HalError(<any>parsedData, response.status);
                }

                throw new Error("Generic server error with status " + response.status + " " + response.statusText + " returned.");
            }
        });
    }

    private static parseResult(response: Response, data: string, jsonParseReviver?: (key: string, value: any) => any): HalData {
        var result: HalData;
        var contentHeader = response.headers.get('content-type');
        if (contentHeader) {
            if (
                ( //The content type is json+halcyon
                    contentHeader.length >= HalEndpointClient.halcyonJsonMimeType.length
                    && contentHeader.substring(0, HalEndpointClient.halcyonJsonMimeType.length) === HalEndpointClient.halcyonJsonMimeType
                )
                ||
                ( //The content type is json, only accepted in the event of an error
                    contentHeader.length >= HalEndpointClient.jsonMimeType.length
                    && contentHeader.substring(0, HalEndpointClient.jsonMimeType.length) === HalEndpointClient.jsonMimeType
                    && !response.ok)
            ) {
                result = data === "" ? null : JSON.parse(data, jsonParseReviver);
            }
            else {
                throw new Error("Unsupported response type " + contentHeader + ".");
            }
        }
        else {
            result = {
                _links: undefined,
                _embedded: undefined
            }
        }
        return result;
    }

    private data: any; //The data from the server with the hal properties removed
    private fetcher: Fetcher;
    private embeds;
    private links;

    /**
     * Constructor.
     * @param {HalData} data - The raw hal data object.
     */
    constructor(data: HalData, fetcher: Fetcher) {
        this.embeds = data._embedded;
        delete data._embedded;
        this.links = data._links;
        delete data._links;
        this.data = <any>data; //HalData is the actual data, trick compiler
        this.fetcher = fetcher;
    }

    /**
     * Get the data portion of this client.
     * @returns The data.
     */
    public GetData<T>(): T {
        return <T>this.data;
    }

    /**
     * Get an embed.
     * @param {string} name - The name of the embed.
     * @returns - The embed specified by name or undefined.
     */
    public GetEmbed(name: string): Embed {
        return new Embed(name, this.embeds[name], this.fetcher);
    }

    /**
     * See if this client has an embed.
     * @param {string} name - The name of the embed
     * @returns True if found, false otherwise.
     */
    public HasEmbed(name: string): boolean {
        return this.embeds !== undefined && this.embeds[name] !== undefined;
    }

    /**
     * Get all the embeds in this client. If they are all the same type specify
     * T, otherwise use any to get generic objects.
     * @returns
     */
    public GetAllEmbeds(): Embed[] {
        //No generators, create array
        var embeds: Embed[] = [];
        for (var key in this.embeds) {
            var embed = new Embed(key, this.embeds[key], this.fetcher);
            embeds.push(embed);
        }
        return embeds;
    }

    //Hal Type Links

    /**
     * Load a new link, this will return a new HalEndpointClient for the results
     * of that request. You can keep using the client that you called this function
     * on to keep making requests if needed. The ref must exist before you can call
     * this function. Use HasLink to see if it is possible.
     * @param {string} ref - The link reference to visit.
     * @returns
     */
    public LoadLink(ref: string): Promise<HalEndpointClient> {
        if (this.HasLink(ref)) {
            return HalEndpointClient.Load(this.GetLink(ref), this.fetcher);
        }
        else {
            throw new Error('Cannot find ref "' + ref + '".');
        }
    }

    /**
     * Load a link that uses a template query. The template args are provided by the query argument.
     * @param {string} ref The ref for the link
     * @param {type} query The object with the template values inside.
     * @returns
     */
    public LoadLinkWithQuery<QueryType>(ref: string, query: QueryType): Promise<HalEndpointClient> {
        if (this.HasLink(ref)) {
            return HalEndpointClient.Load(this.GetQueryLink(this.GetLink(ref), query), this.fetcher);
        }
        else {
            throw new Error('Cannot find ref "' + ref + '".');
        }
    }

    /**
     * Load a new link, this will return a new HalEndpointClient for the results
     * of that request. You can keep using the client that you called this function
     * on to keep making requests if needed. The ref must exist before you can call
     * this function. Use HasLink to see if it is possible.
     * @param {string} ref - The link reference to visit.
     * @param {type} data - The data to send as the body of the request
     * @returns
     */
    public LoadLinkWithBody<BodyType>(ref: string, data: BodyType): Promise<HalEndpointClient> {
        if (this.HasLink(ref)) {
            return HalEndpointClient.Load(this.GetLink(ref), this.fetcher, {
                reqBody: JSON.stringify(data),
                contentType: HalEndpointClient.jsonMimeType
            });
        }
        else {
            throw new Error('Cannot find ref "' + ref + '".');
        }
    }

    /**
     * Load a link that uses a templated query and has body data. The template args are provided by the query argument.
     * @param {string} ref The ref for the link
     * @param {type} query The object with the template values inside.
     * @param {type} data - The data to send as the body of the request
     * @returns
     */
    public LoadLinkWithQueryAndBody<QueryType, BodyType>(ref: string, query: QueryType, data: BodyType): Promise<HalEndpointClient> {
        if (this.HasLink(ref)) {
            return HalEndpointClient.Load(this.GetQueryLink(this.GetLink(ref), query), this.fetcher, {
                reqBody: JSON.stringify(data),
                contentType: HalEndpointClient.jsonMimeType
            });
        }
        else {
            throw new Error('Cannot find ref "' + ref + '".');
        }
    }

    /**
     * Load a new link with files to upload.
     * @param ref - The link reference to visit.
     * @param file - The file to upload, either a single file or an array of multiple files.
     * @returns
     */
    public LoadLinkWithForm<FormType>(ref: string, data: FormType): Promise<HalEndpointClient> {
        if (this.HasLink(ref)) {
            return HalEndpointClient.Load(this.GetLink(ref), this.fetcher, {
                reqBody: this.jsonToFormData(data)
            });
        }
        else {
            throw new Error('Cannot find ref "' + ref + '".');
        }
    }

    /**
     * Load a new link with files to upload and a query string.
     * @param ref - The link reference to visit.
     * @param file - The file to upload, either a single file or an array of multiple files.
     * @param query - The query object.
     * @returns
     */
    public LoadLinkWithQueryAndForm<QueryType, FormType>(ref: string, query: QueryType, data: FormType): Promise<HalEndpointClient> {
        if (this.HasLink(ref)) {
            return HalEndpointClient.Load(this.GetQueryLink(this.GetLink(ref), query), this.fetcher, {
                reqBody: this.jsonToFormData(data)
            });
        }
        else {
            throw new Error('Cannot find ref "' + ref + '".');
        }
    }

    //Raw Links


    /**
     * Load a new link, this will return a new HalEndpointClient for the results
     * of that request. You can keep using the client that you called this function
     * on to keep making requests if needed. The ref must exist before you can call
     * this function. Use HasLink to see if it is possible.
     * @param {string} ref - The link reference to visit.
     * @returns
     */
    public LoadRawLink(ref: string): Promise<Response> {
        if (this.HasLink(ref)) {
            return HalEndpointClient.LoadRaw(this.GetLink(ref), this.fetcher);
        }
        else {
            throw new Error('Cannot find ref "' + ref + '".');
        }
    }

    /**
     * Load a link that uses a template query. The template args are provided by the query argument.
     * @param {string} ref The ref for the link
     * @param {type} query The object with the template values inside.
     * @returns
     */
    public LoadRawLinkWithQuery<QueryType>(ref: string, query: QueryType): Promise<Response> {
        if (this.HasLink(ref)) {
            return HalEndpointClient.LoadRaw(this.GetQueryLink(this.GetLink(ref), query), this.fetcher);
        }
        else {
            throw new Error('Cannot find ref "' + ref + '".');
        }
    }

    /**
     * Load a new link, this will return a new HalEndpointClient for the results
     * of that request. You can keep using the client that you called this function
     * on to keep making requests if needed. The ref must exist before you can call
     * this function. Use HasLink to see if it is possible.
     * @param {string} ref - The link reference to visit.
     * @param {type} data - The data to send as the body of the request
     * @returns
     */
    public LoadRawLinkWithBody<BodyType>(ref: string, data: BodyType): Promise<Response> {
        if (this.HasLink(ref)) {
            return HalEndpointClient.LoadRaw(this.GetLink(ref), this.fetcher, {
                reqBody: JSON.stringify(data),
                contentType: HalEndpointClient.jsonMimeType
            });
        }
        else {
            throw new Error('Cannot find ref "' + ref + '".');
        }
    }

    /**
     * Load a link that uses a templated query and has body data. The template args are provided by the query argument.
     * @param {string} ref The ref for the link
     * @param {type} query The object with the template values inside.
     * @param {type} data - The data to send as the body of the request
     * @returns
     */
    public LoadRawLinkWithQueryAndBody<QueryType, BodyType>(ref: string, query: QueryType, data: BodyType): Promise<Response> {
        if (this.HasLink(ref)) {
            return HalEndpointClient.LoadRaw(this.GetQueryLink(this.GetLink(ref), query), this.fetcher, {
                reqBody: JSON.stringify(data),
                contentType: HalEndpointClient.jsonMimeType
            });
        }
        else {
            throw new Error('Cannot find ref "' + ref + '".');
        }
    }

    /**
     * Load a new link with files to upload.
     * @param ref - The link reference to visit.
     * @param file - The file to upload, either a single file or an array of multiple files.
     * @returns
     */
    public LoadRawLinkWithForm<FormType>(ref: string, data: FormType): Promise<Response> {
        if (this.HasLink(ref)) {
            return HalEndpointClient.LoadRaw(this.GetLink(ref), this.fetcher, {
                reqBody: this.jsonToFormData(data)
            });
        }
        else {
            throw new Error('Cannot find ref "' + ref + '".');
        }
    }

    /**
     * Load a new link with files to upload and a query string.
     * @param ref - The link reference to visit.
     * @param file - The file to upload, either a single file or an array of multiple files.
     * @param query - The query object.
     * @returns
     */
    public LoadRawLinkWithQueryAndForm<QueryType, FormType>(ref: string, query: QueryType, data: FormType): Promise<Response> {
        if (this.HasLink(ref)) {
            return HalEndpointClient.LoadRaw(this.GetQueryLink(this.GetLink(ref), query), this.fetcher, {
                reqBody: this.jsonToFormData(data)
            });
        }
        else {
            throw new Error('Cannot find ref "' + ref + '".');
        }
    }

    //Thanks Raj Pawan Gumdal at
    //https://stackoverflow.com/questions/22783108/convert-js-object-to-form-data
    //Removed the test json bit
    private jsonToFormData<T>(inJSON: T, inFormData?: FormData, parentKey?: string) {
        // http://stackoverflow.com/a/22783314/260665
        // Raj: Converts any nested JSON to formData.
        var form_data: FormData = inFormData || new FormData();
        for (var key in inJSON) {
            // 1. If it is a recursion, then key has to be constructed like "parent.child" where parent JSON contains a child JSON
            // 2. Perform append data only if the value for key is not a JSON, recurse otherwise!
            var constructedKey: string = key;
            if (parentKey) {
                constructedKey = parentKey + "." + key;
            }

            var value = inJSON[key];
            if (value && value.constructor === {}.constructor) {
                // This is a JSON, we now need to recurse!
                this.jsonToFormData(value, form_data, constructedKey);
            } else {
                form_data.append(constructedKey, <any>value);
            }
        }
        return form_data;
    }

    /**
     * Load the documentation for a link.
     */
    public LoadLinkDoc(ref: string): Promise<HalEndpointClient> {
        return this.LoadLink(ref + ".Docs");
    }

    /**
     * Load a new link, this will return a new HalEndpointClient for the results
     * of that request. You can keep using the client that you called this function
     * on to keep making requests if needed. The ref must exist before you can call
     * this function. Use HasLink to see if it is possible.
     * @param {string} ref - The link reference to visit.
     * @returns
     */
    public HasLinkDoc(ref: string): boolean {
        return this.HasLink(ref + ".Docs");
    }

    /**
     * Get a single named link.
     * @param {string} ref - The name of the link to recover.
     * @returns The link or undefined if the link does not exist.
     */
    public GetLink(ref: string): HalLink {
        return this.links[ref];
    }

    /**
     * Check to see if a link exists in this collection.
     * @param {string} ref - The name of the link (the ref).
     * @returns - True if the link exists, false otherwise
     */
    public HasLink(ref: string): boolean {
        return this.links !== undefined && this.links[ref] !== undefined;
    }

    /**
     * Get all links in this collection. Will transform them to a HalLinkInfo, these are copies of the original links with ref added.
     * @returns
     */
    public GetAllLinks(): HalLinkInfo[] {
        //If only we had generators, have to load entire collection
        var linkInfos: HalLinkInfo[] = [];
        for (var key in this.links) {
            var link: HalLink = this.links[key];
            linkInfos.push({
                href: link.href,
                method: link.method,
                rel: key
            });
        }
        return linkInfos;
    }

    /**
     * Helper function to get the expanded version of a query link.
     * @param {type} link
     * @param {type} query
     * @returns
     */
    private GetQueryLink(link: HalLink, query: any): HalLink {
        if (query !== undefined && query !== null) {
            var uri = new Uri(link.href);
            uri.setQueryFromObject(query);
            return {
                href: uri.build(),
                method: link.method
            };
        }
        else {
            return link; //No query, just return original link.
        }
    }
}