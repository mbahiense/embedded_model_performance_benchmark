//  Initial setup
db = db.getSiblingDB('pattern_comparison');
const fs = require('fs');
const stocks = JSON.parse(fs.readFileSync('./stock_tickers.json', { encoding: 'utf-8' }));

//  1. Data creation 
// Attribute Pattern - Model
// {
//     assetId: number,
//     assetName: string,
//     tickerSymbols: [
//         { ticker: string, companyName: string, industry: string, amount: number, price: number },
//     ]
// }

// Nester Pattern - Model
// {
//     assetId: number,
//     assetName: string,
//     tickerSymbols: {
//         [ticker: string] : { companyName: string, industry: string, amount: number, price: number },
//     }
// }

const rnd = () => Math.floor(Math.random() * 10000);

const getNestedSymbols = () => {
    return stocks.reduce((ac, { ticker, ...args }) => Object.assign(ac, { [ticker]: { ...args, amount: rnd(), price: rnd() } }), {});
}

const getAttributeSymbols = () => {
    return stocks.map(ticker => ({ ...ticker, amount: rnd(), price: rnd() }));
};

const formatBytes = (bytes) => {
    if (bytes === 0 && typeof (bytes) !== 'object') return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const measureTime = (operation, collection) => {
    const start = Date.now();
    operation(collection);
    return Date.now() - start;
}

const symbolsAttribute = getAttributeSymbols();
const symbolsNested = getNestedSymbols();
const evaluations = [1000, 5000, 10000, 30000, 50000, 70000, 100000];

print(`Evaluations for ${evaluations.join(`,`)}`);

for (let amount_assets of evaluations) {
    print(`starting evaluation with ${amount_assets}`);

    db.assets_attribute.drop();
    db.assets_nested.drop();

    const size = 1000;
    let pages = amount_assets / size;
    let attributeInsertTime = 0;
    let nestedInsertTime = 0;
    let acumulative = 0;

    while (pages > 0) {
        print(`Insert page ${pages}/${amount_assets / size}`)
        let attributeAssets = [];
        let nestedAssets = [];
        for (let i = 1; i <= size; i++) {
            const asset = { assetId: i + acumulative, assetName: `asset_${i + acumulative}` };
            attributeAssets.push({ ...asset, tickerSymbols: symbolsAttribute });
            nestedAssets.push({ ...asset, tickerSymbols: symbolsNested });
        }

        attributeInsertTime += measureTime(
            (collection) => collection.insertMany(attributeAssets),
            db.assets_attribute);

        nestedInsertTime += measureTime(
            (collection) => collection.insertMany(nestedAssets),
            db.assets_nested);
        acumulative = (pages - 1) * size;
        pages -= 1;
    }

    //  2. Index creation 
    print(`creating the index - 1/5`);
    db.assets_attribute.createIndex({ 'assetId': 1 });
    print(`creating the index - 2/5`);
    db.assets_attribute.createIndex({ 'tickerSymbols.ticker': 1 });
    print(`creating the index - 3/5`);
    db.assets_attribute.createIndex({ 'assetId': 1, 'tickerSymbols.ticker': 1 });

    print(`creating the index - 4/5`);
    db.assets_nested.createIndex({ 'assetId': 1 });
    print(`creating the index - 5/5`);
    // Wildcard indexes compounding allowed from v7
    db.assets_nested.createIndex({ 'assetId': 1, 'tickerSymbols.$**': 1 });

    print(`query ordinary`);
    // a) Simple Query by attribute (Read operation)
    const attributeQueryTime = measureTime(
        (collection) => collection.find({ 'tickerSymbols': { $elemMatch: { ticker: 'CGTX' } } }).projection({ assetId: 1 }),
        db.assets_attribute);

    const nestedQueryTime = measureTime(
        (collection) => collection.find({ 'tickerSymbols.CGTX': { $exists: true } }).projection({ assetId: 1 }),
        db.assets_nested);

    print(`query update attribute one`);
    // b) Update Document (Write operation) 
    const ticker = 'NEW_TICKER';
    const newTicker = { companyName: 'Just test', industry: 'Research', amount: 1, price: 1 };
    const attributeUpdateOneTime = measureTime(
        (collection) => collection.updateOne(
            { assetId: 1 },
            { $addToSet: { tickerSymbols: { ticker, ...newTicker } } }
        ),
        db.assets_attribute,
    );

    print(`query update attribute many`);
    const attributeUpdateManyTime = measureTime(
        (collection) => collection.updateMany(
            { assetId: { $gte: amount_assets / 2 } },
            { $addToSet: { tickerSymbols: { ticker, ...newTicker } } }
        ),
        db.assets_attribute,
    );

    print(`query update nested one`);
    const nestedUpdateOneTime = measureTime(
        (collection) => collection.updateOne(
            { assetId: 1 },
            { $set: { [`tickerSymbols.${ticker}`]: newTicker } }
        ),
        db.assets_nested
    );

    print(`query update nested many`);
    const nestedUpdateManyTime = measureTime(
        (collection) => collection.updateMany(
            { assetId: { $gte: amount_assets / 2 } },
            { $set: { [`tickerSymbols.${ticker}`]: newTicker } },
        ),
        db.assets_nested
    );

    // c) Advanced Query by new attribute skipping not related (Read operation)
    print(`query advanced attribute`);
    const attributeAdvanceQueryTime = measureTime(
        (collection) => collection.aggregate([
            { $match: { tickerSymbols: { $elemMatch: { ticker: 'NEW_TICKER' } } } },
            {
                $project: {
                    assetId: 1,
                    tickerSymbols: {
                        $arrayElemAt: [
                            '$tickerSymbols',
                            { $indexOfArray: ['$tickerSymbols.ticker', 'NEW_TICKER'] }
                        ]
                    }
                }
            },
            { $sort: { assetId: -1 } }
        ]),
        db.assets_attribute);

    print(`query advanced nested`);
    const nestedAdvanceQueryTime = measureTime(
        (collection) => collection.aggregate([
            { $match: { 'tickerSymbols.NEW_TICKER': { $exists: true } } },
            { $replaceRoot: { newRoot: { NEW_TICKER: '$$ROOT.tickerSymbols.NEW_TICKER', assetId: '$$ROOT.assetId' } } },
            { $sort: { assetId: -1 } }
        ]),
        db.assets_nested
    );

    //  4. Results
    print(`=== Results for ${amount_assets} elements ===`);
    print(`# Insert all operation - ${amount_assets} => pages ${amount_assets / size} with ${size}`);
    print(`Attribute Pattern - Insert ${amount_assets}: ${attributeInsertTime} ms`);
    print(`Nested Pattern - Insert ${amount_assets}: ${nestedInsertTime} ms`);

    print(`# Query operation - ordinary`)
    print(`Attribute Pattern - Query by 'ticker=CGTX': ${attributeQueryTime} ms`);
    print(`Nested Pattern - Query by 'ticker=CGTX': ${nestedQueryTime} ms`);

    print(`# Query operation - advanced`)
    print(`Attribute Pattern - Advanced Query by 'ticker=NEW_TICKER': ${attributeAdvanceQueryTime} ms`);
    print(`Nested Pattern - Advanced Query by 'ticker=NEW_TICKER': ${nestedAdvanceQueryTime} ms`);

    print(`# Update operation - one`)
    print(`Attribute Pattern - new attribute: ${attributeUpdateOneTime} ms`);
    print(`Nested Pattern - new attribute: ${nestedUpdateOneTime} ms`);

    print(`# Update operation - many`)
    print(`Attribute Pattern - new attribute: ${attributeUpdateManyTime} ms`);
    print(`Nested Pattern - new attribute: ${nestedUpdateManyTime} ms`);


    //  5. Resources - Document Index
    const presentResources = (stats) => {
        const fields = ["indexSizes","size", "count", "storageSize", "totalIndexSize", "totalSize", "avgObjSize", "nindexes", "scaleFactor", "ns"];
        const sufix = (key) => key.match(/size/i) && key > 0 ? `(${formatBytes(stats[key])})` : '';
        return fields.map(key => `${key}:${JSON.stringify(stats[key])}  ${sufix(k)}`).join(`,\n\t`);
    }
    print('=== Resources ===');
    print(`Attribute Pattern: \n\t ${presentResources(db.assets_attribute.stats())}`);
    print(`Nested Pattern: \n\t ${presentResources(db.assets_nested.stats())}`);
    print(`\n\n ---=== Finished Evaluation for ${amount_assets} ===--- \n\n\n`);
}
