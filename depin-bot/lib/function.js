const axios = require('axios');
const fetch = require('node-fetch');

exports.getBuffer = async (url, options) => {
  try {
    const res = await axios({
      method: 'get',
      url,
      headers: options?.headers || {},
      responseType: 'arraybuffer'
    });
    return res.data;
  } catch (e) {
    console.error('getBuffer error:', e);
    return null;
  }
};

exports.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.isUrl = (url) => /^https?:\/\//.test(url);

exports.fetchJson = async (url, options) => {
  try {
    const res = await fetch(url, options);
    return await res.json();
  } catch (e) {
    return {};
  }
};

exports.getSizeMedia = async (buffer) => {
  return Buffer.byteLength(buffer);
};

exports.generateMessageTag = (epoch) => {
  let tag = (epoch ? epoch : +new Date) / 1000;
  return tag.toString();
};
