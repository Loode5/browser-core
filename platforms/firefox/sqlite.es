/* global FileUtils */

Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import('resource://gre/modules/FileUtils.jsm');

const connections = new Map();

export function openDBHome(dbNameArr) {
  const dbName = dbNameArr.join('');
  const filePath = FileUtils.getFile('Home', dbNameArr);
  const connection = Services.storage.openDatabase(filePath);
  connections.set(dbName, connection);
  return connection;
}

export function open(databaseName) {
  let connection;
  if (!connections.has(databaseName)) {
    const filePath = FileUtils.getFile('ProfD', [databaseName]);
    connection = Services.storage.openDatabase(filePath);
    connections.set(databaseName, connection);
  } else {
    connection = connections.get(databaseName);
  }
  return connection;
}

export function close(databaseName) {
  if (!connections.has(databaseName)) {
    return;
  }
  const connection = connections.get(databaseName);
  connections.delete(databaseName);
  // according to docs we should not use close because we use async statements
  // see https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/mozIStorageConnection#close()
  connection.asyncClose();
}

export function remove(databaseName) {
  if (FileUtils.getFile('ProfD', [databaseName]).exists()) {
    FileUtils.getFile('ProfD', [databaseName]).remove(false);
  }
}
// TODO: remove default export
export default open;
