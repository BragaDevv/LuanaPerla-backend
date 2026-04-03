const admin = require("firebase-admin");

let app;

function getFirebaseAdmin() {
  if (!app) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  return admin;
}

function getDb() {
  return getFirebaseAdmin().firestore();
}

module.exports = {
  getFirebaseAdmin,
  getDb,
};