const fs = require('fs');

function dataBase(path) {
  return {
    read: async () => {
      try {
        if (!fs.existsSync(path)) return {};
        const data = fs.readFileSync(path);
        return JSON.parse(data);
      } catch {
        return {};
      }
    },
    write: async (data) => {
      fs.writeFileSync(path, JSON.stringify(data, null, 2));
    }
  };
}

module.exports = { dataBase };
