var INHERIT = require('inherit'),
    UTIL = require('util'),
    PATH = require('./path'),
    U = require('./util'),
    LOGGER = require('./logger'),
    Q = require('qq'),
    registry = require('./nodesregistry'),

    node = require('./nodes/node'),
    levelNodes = require('./nodes/level'),
    libNodes = require('./nodes/lib'),

    ArchName = exports.ArchName = 'Arch';

exports.__defineGetter__(ArchName, function() {
    return registry.getNodeClass(ArchName);
});

registry.decl('Arch', {

    __constructor: function(arch, opts) {
        this.arch = arch;
        this.root = opts.root;
        this.opts = opts;
    },

    bundlesLevelsRegexp: /^(pages.*|bundles.*)/i,
    blocksLevelsRegexp:  /^(blocks.*)/i,

    libraries: {},

    getLibraries: function() {
        return this.libraries;
    },

    alterArch: function() {
        var _this = this;

        return Q.step(
            function() {
                LOGGER.silly("Going to run createCommonNodes()");
                return Q.call(_this.createCommonNodes, _this);
            },

            function(common) {
                LOGGER.silly("Going to run createBlockLibrariesNodes()");
                return [
                    common,
                    Q.call(_this.createBlockLibrariesNodes, _this, common)
                ];
            },

            function(common, libs) {
                LOGGER.silly("Going to run createBlocksLevelsNodes()");
                return [
                    common,
                    libs,
                    Q.call(_this.createBlocksLevelsNodes, _this, common, libs)
                ]
            },

            function(common, libs, blocks){
                LOGGER.silly("Going to run createBundlesLevelsNodes()");
                return Q.call(_this.createBundlesLevelsNodes, _this, common, (libs || []).concat(blocks));
            })

            .then(function() {
                return _this.opts.inspector && U.snapshotArch(
                    _this.arch,
                    PATH.join(_this.root, '.bem/snapshots/' + UTIL.format('%s_defaultArch alterArch.json', (new Date()-0))));
            })

            .then(function() {
                LOGGER.info(_this.arch.toString());
                return _this.arch;
            });
    },

    createCommonNodes: function() {
        var build = new node.Node('build'),
            all = new node.Node('all');

        this.arch
            .setNode(all)
            .setNode(build, all.getId());

        return build.getId();
    },

    createBlockLibrariesNodes: function(parent) {

        var libs = this.getLibraries();
        return Object.keys(libs).map(function(l) {

            var lib = libs[l],
                libNodeClass = U.toUpperCaseFirst(lib.type) + libNodes.LibraryNodeName,
                libNode = new (registry.getNodeClass(libNodeClass))(U.extend({}, lib, {
                        root: this.root,
                        target: l
                    }));

            this.arch.setNode(libNode, parent);
            return libNode.getId();

        }, this);

    },

    createBlocksLevelsNodes: function(parent, children) {

        return this.createLevelsNodes(
            this.getBlocksLevels(this.root),
            levelNodes.LevelNode,
            parent,
            children);

    },

    createBundlesLevelsNodes: function(parent, children) {

        return this.createLevelsNodes(
            this.getBundlesLevels(this.root),
            levelNodes.BundlesLevelNode,
            parent,
            children);

    },

    createLevelsNodes: function(levels, nodeClass, parent, children) {

        var _this = this;

        return Q.when(levels)
            .then(function(levels) {

                return levels.map(function(level) {
                    var node = new nodeClass({
                        root: _this.root,
                        level: level
                    });

                    _this.arch.setNode(node, parent, children);

                    return node.getId();
                });

            });

    },

    getBlocksLevels: function(from) {
        return this.getLevels(from, this.blocksLevelsRegexp);
    },

    getBundlesLevels: function(from) {
        return this.getLevels(from, this.bundlesLevelsRegexp);
    },

    getLevels: function(from, mask) {

        return U.getDirsAsync(from)
            .invoke('filter', function(dir) {
                return dir.match(mask);
            });

    }

});
