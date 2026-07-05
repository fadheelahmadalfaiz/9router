function columnExists(db, table, column) {
  return db.all(`PRAGMA table_info(${table})`).some((row) => row.name === column);
}

export default {
  version: 2,
  name: "api-key-limits",
  up(db) {
    if (!columnExists(db, "apiKeys", "limits")) {
      db.exec(`ALTER TABLE apiKeys ADD COLUMN limits TEXT`);
    }

  },
};
