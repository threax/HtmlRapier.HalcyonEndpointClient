import * as models from 'htmlrapier/src/models';
import * as components from 'htmlrapier/src/components';
import * as iter from 'htmlrapier/src/iterable';
import * as typeId from 'htmlrapier/src/typeidentifiers';

/**
 * This interface matches the auto generated client code for halcyon results.
 */
export interface HypermediaResult<T> {
    data: T;
}

/**
 * This class makes it easier to use hypermedia results in models where the result
 * data is sent to the binding functions and the result itself is sent to the controller
 * constructor as the item data and the callback functions. Wrap your real model inside
 * this class to use it. Getting data will get the data back out as the DataType specified.
 */
export class ResultModel<DataType, ResultType extends HypermediaResult<DataType>> {
    constructor(private model: models.Model<DataType>) {

    }

    /**
     * Set the data on the model. The model will not modify the data passed in again,
     * you must call getData to get it back out.
     */
    public setData(data: ResultType | ResultType[] | iter.IterableInterface<ResultType>, createdCallback?: components.CreatedCallback<ResultType>, variantFinderCallback?: components.VariantFinderCallback<ResultType>) {
        this.model.clear();

        if (data !== undefined && data !== null) {
            var items: iter.IterableInterface<ResultType>;

            if (Array.isArray(data)) {
                items = new iter.Iterable(data);
            }
            else if (typeId.isForEachable(data)) {
                items = <iter.IterableInterface<ResultType>>data;
            }
            else {
                this.appendData((<ResultType>data), createdCallback, variantFinderCallback); //Directly append single item
            }

            if (items) {
                items.forEach(result => {
                    this.appendData(result, createdCallback, variantFinderCallback);
                });
            }
        }
    }

    /**
     * Add more data to the model, does not erase existing data.
     */
    public appendData(result: ResultType, createdCallback?: components.CreatedCallback<ResultType>, variantFinderCallback?: components.VariantFinderCallback<ResultType>) {
        var createdShim = undefined;
        if (createdCallback !== undefined) {
            createdShim = (created: any, item: DataType) => {
                createdCallback(created, result);
            };
        }

        var variantShim = undefined;
        if (variantFinderCallback !== undefined) {
            variantShim = (item): string => {
                return variantFinderCallback(result);
            };
        }

        this.model.appendData(result.data, createdShim, variantShim);
    }

    /**
     * Clear all data from the model.
     */
    public clear() {
        this.model.clear();
    }

    /**
     * Get the current data from the model.
     */
    public getData(): DataType {
        return this.model.getData();
    }

    /**
     * Get the data source for the model.
     */
    public getSrc(): string {
        return this.model.getSrc();
    }

    /**
     * Set the prototype object to use when getting data.
     * When the new object is created it will use this as
     * its prototype.
     */
    public setPrototype(proto: DataType): void {
        this.model.setPrototype(proto);
    }
}