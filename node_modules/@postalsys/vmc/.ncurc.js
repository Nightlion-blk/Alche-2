module.exports = {
    upgrade: true,
    reject: [
        // only works as ESM
        'chai',
        // api changes
        'eslint'
    ]
};
