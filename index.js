'use strict';
var _ = require('lodash');
var chalk = require('chalk');
var gutil = require('gulp-util');
var path = require('path');
var stringify = require('json-stable-stringify');
var through = require('through2');
var Translations = require('./modules/translations.js');

/**
 * Constants
 */
const PLUGIN_NAME = 'gulp-angular-translate';

function angularTranslate(fileName, options) {

    if (!fileName) {
        throw new gutil.PluginError(PLUGIN_NAME,
            chalk.red('fileName') + ' required');
    }

    options = options || {};

    /**
     * Check lang parameter.
     */
    if (!_.isArray(options.lang) || !options.lang.length) {
        throw new gutil.PluginError(PLUGIN_NAME,
            chalk.red('Param lang required'));
    }

    var firstFile,
        results = {};

    /**
     * Angular Translate
     */
    return through.obj(function (file, enc, callback) {

        if (file.isStream()) {
            throw new gutil.PluginError(PLUGIN_NAME,
                chalk.red('Straming not supported.'));
		}

        if (file.isNull()) {
            // Return empty file.
            return callback(null, file);
        }

        if (!firstFile) {
            firstFile = file;
        }

        if (file.isStream()) {
            gutil.log('stream');
        }

        if (file.isBuffer()) {

            /**
             * Set all needed variables
             */
            var defaultLang = options.defaultLang || '.',
                interpolation = options.interpolation ||
                    {startDelimiter: '{{', endDelimiter: '}}'},
                // source = this.data.source || '',
                nullEmpty = options.nullEmpty || false,
                namespace = options.namespace || false,
                prefix = options.prefix || '',
                safeMode = options.safeMode ? true : false,
                suffix = options.suffix || '.json',
                customRegex = _.isArray(options.customRegex) ?
                    options.customRegex : [],
                stringify_options = options.stringifyOptions || null;

                var customStringify = function (val) {
                    if (stringify_options) {
                        return stringify(val, _.isObject(stringify_options) ?
                            stringify_options :
                        {
                            space: '    ',
                            cmp: function (a, b) {
                                var lower = function (a) {
                                    return a.toLowerCase();
                                };
                                return lower(a.key) < lower(b.key) ? -1 : 1;
                            }
                        });
                    }
                    return JSON.stringify(val, null, 4);
                };

                /**
                 * Use to escape some char into regex patterns
                 */
                var escapeRegExp = function (str) {
                    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g,
                        "\\$&");
                };

                // Extract regex strings from content and feed results object
                var _extractTranslation = function (regexName, regex,
                    content, results) {

                    var r;
                    gutil.log('----------------------------------------------');
                    gutil.log('Process extraction with regex : "' + regexName + '"');
                    gutil.log(regex);

                    regex.lastIndex = 0;

                    while ((r = regex.exec(content)) !== null) {

                        // Result expected [STRING, KEY, SOME_REGEX_STUF]
                        // Except for plural hack [STRING, KEY, ARRAY_IN_STRING]
                        if (r.length >= 2) {
                            var translationKey, evalString;
                            var translationDefaultValue = "";

                            switch (regexName) {
                                case 'HtmlDirectivePluralFirst':
                                    var tmp = r[1];
                                    r[1] = r[2];
                                    r[2] = tmp;
                                    break;
                                case 'HtmlDirectivePluralLast':
                                    evalString = eval(r[2]);
                                    if (_.isArray(evalString) &&
                                        evalString.length >= 2) {
                                        translationDefaultValue = "{NB, plural, one{" + evalString[0] + "} other{" + evalString[1] + "}" + (evalString[2] ? ' ' + evalString[2] : '');
                                    }
                                    translationKey = r[1].trim();
                                    break;
                                default:
                                translationKey = r[1].trim();
                            }

                            // Avoid empty translation
                            if (translationKey === "") {
                                return;
                            }

                            switch (regexName) {
                                case "commentSimpleQuote":
                                case "HtmlFilterSimpleQuote":
                                case "JavascriptServiceSimpleQuote":
                                case "JavascriptServiceInstantSimpleQuote":
                                case "JavascriptFilterSimpleQuote":
                                case "HtmlNgBindHtml":
                                    translationKey = translationKey.replace(/\\\'/g, "'");
                                    break;
                                case "commentDoubleQuote":
                                case "HtmlFilterDoubleQuote":
                                case "JavascriptServiceDoubleQuote":
                                case "JavascriptServiceInstantDoubleQuote":
                                case "JavascriptFilterDoubleQuote":
                                    translationKey = translationKey.replace(/\\\"/g, '"');
                                    break;
                                case "JavascriptServiceArraySimpleQuote":
                                case "JavascriptServiceArrayDoubleQuote":
                                    var key;

                                    if(regexName === "JavascriptServiceArraySimpleQuote") {
                                        key = translationKey.replace(/'/g, '');
                                    } else {
                                        key = translationKey.replace(/"/g, '');
                                    }
                                    key = key.replace(/[\][]/g, '');
                                    key = key.split(',');

                                    key.forEach(function(item){
                                        item = item.replace(/\\\"/g, '"').trim();
                                        results[item] = translationDefaultValue;
                                    });
                                    break;
                                }

                                if( regexName !== "JavascriptServiceArraySimpleQuote" &&
                                regexName !== "JavascriptServiceArrayDoubleQuote") {
                                    results[ translationKey ] = translationDefaultValue;
                                }


                            }
                        }
                    };

                    // Regexs that will be executed on files
                    var regexs = {
                        commentSimpleQuote: '\\/\\*\\s*i18nextract\\s*\\*\\/\'((?:\\\\.|[^\'\\\\])*)\'',
                        commentDoubleQuote: '\\/\\*\\s*i18nextract\\s*\\*\\/"((?:\\\\.|[^"\\\\])*)"',
                        HtmlFilterSimpleQuote: escapeRegExp(interpolation.startDelimiter) + '\\s*\'((?:\\\\.|[^\'\\\\])*)\'\\s*\\|\\s*translate(:.*?)?\\s*' + escapeRegExp(interpolation.endDelimiter),
                        HtmlFilterDoubleQuote: escapeRegExp(interpolation.startDelimiter) + '\\s*"((?:\\\\.|[^"\\\\\])*)"\\s*\\|\\s*translate(:.*?)?\\s*' + escapeRegExp(interpolation.endDelimiter),
                        HtmlDirective: '<[^>]*translate[^{>]*>([^<]*)<\/[^>]*>',
                        HtmlDirectiveStandalone: 'translate="((?:\\\\.|[^"\\\\])*)"',
                        HtmlDirectivePluralLast: 'translate="((?:\\\\.|[^"\\\\])*)".*angular-plural-extract="((?:\\\\.|[^"\\\\])*)"',
                        HtmlDirectivePluralFirst: 'angular-plural-extract="((?:\\\\.|[^"\\\\])*)".*translate="((?:\\\\.|[^"\\\\])*)"',
                        HtmlNgBindHtml: 'ng-bind-html="\\s*\'((?:\\\\.|[^\'\\\\])*)\'\\s*\\|\\s*translate(:.*?)?\\s*"',
                        JavascriptServiceSimpleQuote: '\\$translate\\(\\s*\'((?:\\\\.|[^\'\\\\])*)\'[^\\)]*\\)',
                        JavascriptServiceDoubleQuote: '\\$translate\\(\\s*"((?:\\\\.|[^"\\\\])*)"[^\\)]*\\)',
                        JavascriptServiceArraySimpleQuote: '\\$translate\\((?:\\s*(\\[\\s*(?:(?:\'(?:(?:\\.|[^.*\'\\\\])*)\')\\s*,*\\s*)+\\s*\\])\\s*)\\)',
                        JavascriptServiceArrayDoubleQuote: '\\$translate\\((?:\\s*(\\[\\s*(?:(?:"(?:(?:\\.|[^.*\'\\\\])*)")\\s*,*\\s*)+\\s*\\])\\s*)\\)',
                        JavascriptServiceInstantSimpleQuote: '\\$translate\\.instant\\(\\s*\'((?:\\\\.|[^\'\\\\])*)\'[^\\)]*\\)',
                        JavascriptServiceInstantDoubleQuote: '\\$translate\\.instant\\(\\s*"((?:\\\\.|[^"\\\\])*)"[^\\)]*\\)',
                        JavascriptFilterSimpleQuote: '\\$filter\\(\\s*\'translate\'\\s*\\)\\s*\\(\\s*\'((?:\\\\.|[^\'\\\\])*)\'[^\\)]*\\)',
                        JavascriptFilterDoubleQuote: '\\$filter\\(\\s*"translate"\\s*\\)\\s*\\(\\s*"((?:\\\\.|[^"\\\\\])*)"[^\\)]*\\)'
                    };

                    _.forEach(customRegex, function (regex, key) {
                        regexs['others_' + key] = regex;
                    });

                    /**
                     * Recurse an object to retrieve as an array all the value of named parameters
                     * INPUT: {"myLevel1": [{"val": "myVal1", "label": "MyLabel1"}, {"val": "myVal2", "label": "MyLabel2"}], "myLevel12": {"new": {"label": "myLabel3é}}}
                     * OUTPUT: ["MyLabel1", "MyLabel2", "MyLabel3"]
                     * @param data
                     * @returns {Array}
                     * @private
                    */
                    var _recurseObject = function (data) {
                        var currentArray = [];
                        if (_.isObject(data) || _.isArray(data.attr)) {
                            for (var attr in data) {
                                // if (_.isString(data[attr]) && _.indexOf(jsonSrcName, attr) !== -1) {
                                //     currentArray.push(data[attr]);
                                // } else
                                if (_.isObject(data[attr]) || _.isArray(data.attr)) {
                                    var recurse = _recurseObject(data[attr]);
                                    currentArray = _.union(currentArray, recurse);
                                }
                            }
                        }
                        return currentArray;
                    };

                    /**
                     * Recurse feed translation object (utility for namespace)
                     * INPUT: {"NS1": {"NS2": {"VAL1": "", "VAL2": ""} } }
                     * OUTPUT: {"NS1": {"NS2": {"VAL1": "NS1.NS2.VAL1", "VAL2": "NS1.NS2.VAL2"} } }
                     * @param {Object} data
                     * @param {string?} path
                     * @private
                     */
                    var _recurseFeedDefaultNamespace = function (data, path) {
                        path = path || '';
                        if (_.isObject(data)) {
                            for (var key in data) {
                                if (_.isObject(data)) {
                                    data[ key ] = _recurseFeedDefaultNamespace(data[ key ], path !== '' ? path + '.' + key : key);
                                }
                            }
                            return data;
                        } else {
                            if (data === null && data === "") {
                                // return default data if empty/null
                                return path;
                            } else {
                                return data;
                            }
                        }
                    };

                    /**
                     * Start extraction of translations
                     */
                    var content = file.contents.toString(),
                        _regex;

                    // Execute all regex defined at the top of this file
                    for (var i in regexs) {
                        _regex = new RegExp(regexs[i], "gi");
                        switch (i) {
                            // Case filter HTML simple/double quoted
                            case "HtmlFilterSimpleQuote":
                            case "HtmlFilterDoubleQuote":
                            case "HtmlDirective":
                            case "HtmlDirectivePluralLast":
                            case "HtmlDirectivePluralFirst":
                            case "JavascriptFilterSimpleQuote":
                            case "JavascriptFilterDoubleQuote":
                                // Match all occurences
                                var matches = content.match(_regex);
                                if (_.isArray(matches) && matches.length) {
                                    // Through each matches, we'll execute regex to get translation key
                                    for (var index in matches) {
                                        if (matches[index] !== "") {
                                            _extractTranslation(i, _regex, matches[index], results);
                                        }
                                    }
                                }
                                break;
                            // Others regex
                            default:
                            _extractTranslation(i, _regex, content, results);

                        }
                    }

                    // Create translation object
                    var _translation = new Translations({
                        "safeMode": safeMode,
                        "tree": namespace,
                        "nullEmpty": nullEmpty
                        }, results);

                    results = _translation;

// gutil.log(stringify(_translation));
        }

        callback(null, file);
    }, function (cb) {
        if (!firstFile) {
            cb();
            return;
        }

        var _this = this;

            options.lang.forEach(function (lang) {
                _this.push(new gutil.File({
                    cwd: firstFile.cwd,
                    base: firstFile.base,
                    path: path.join(firstFile.base, lang + '.json'),
                    contents: new Buffer(JSON.stringify(results, null, 4))
                }));
            });

gutil.log(chalk.blue(stringify(_this)));
            cb();
    });
}

module.exports = angularTranslate;
