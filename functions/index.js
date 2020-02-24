const path = require("path");
const os = require("os");
const fs = require("fs");

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const pdfParser = require("pdf-parse");
const algolia = require("algoliasearch");

admin.initializeApp();

const client = algolia(
  functions.config().algolia.app_id,
  functions.config().algolia.admin_key
);
const index = client.initIndex("dev_CASES");

function chunkString(str, length) {
  return str.match(new RegExp(`.{1,${length}}`, "gm"));
}

exports.indexcase = functions.storage
  .object("cases")
  .onFinalize(async object => {
    const fileBucket = object.bucket;
    const filePath = object.name;
    const fileName = path.basename(filePath);

    let slug = fileName.slice(0, -4);
    let title = slug.replace(/-/g, " ");

    const bucket = admin.storage().bucket(fileBucket);
    const tempFilePath = path.join(os.tmpdir(), fileName);

    await bucket.file(filePath).download({ destination: tempFilePath });

    let dataBuffer = fs.readFileSync(tempFilePath);
    let pdf = await pdfParser(dataBuffer);
    let textContent = pdf.text.replace(/(\r\n|\n|\r)/gm, "");

    let chunks = chunkString(textContent, 1000);

    let chunksWithAttributes = chunks.map(i => {
      return {
        title,
        slug,
        url: object.selfLink,
        content: i
      };
    });

    await index.saveObjects(chunksWithAttributes, {
      autoGenerateObjectIDIfNotExist: true
    });

    return fs.unlinkSync(tempFilePath);
  });
