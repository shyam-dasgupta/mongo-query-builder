/**
 * Created by Shyam on 3/28/2017.
 */
var dataUtils = require('utils-data');

/**
 * Parses a search string into one or more space separated tokens, * for
 * wildcard characters and double-quoted string for exact phrase match.
 * All matches are case-insensitive.
 * <p>
 * For example, the string:
 * <pre>hello wor*d I am "Shyam Dasgupta"</pre>
 * will create the following RegExps:
 * <pre>[/hello/i, /wor[A-Za-z0-9_-]*d/i, /I/i, /am/i, /Shyam Dasgupta/i]</pre>
 * Matching is done in words beginnings, unless specified otherwise using the
 * matchWithinWords argument. For example, the token "pot" will match "Potter"
 * and "#pottery", but not "teapot", since the latter does not have pot at the
 * beginning of the word. It will match all three if matchWithinWords is true.
 * <p>Note that special characters like # are skipped while calculating the
 * beginning of a word.
 * @param {QueryBuilder} parentBuilder The parent query builder
 * @param {string} queryStr Input string containing one or more space separated
 * tokens.
 * @param {boolean} [matchWithinWords=false] If true, matching is done anywhere.
 * By default, matching is done only at word beginnings.
 * @constructor
 */
var SearchQueryBuilder = function (parentBuilder, queryStr, matchWithinWords) {
    var regExps = SearchQueryBuilder.searchQueryToRegexps(queryStr, matchWithinWords);

    /**
     * Matches the given Regular expression with all the fields.
     * @param {Array.<string>} fields Array of document fields.
     * @param {boolean} [matchAnyRegex=false] If true, match any
     * of the search query tokens, else match all.
     * @returns {QueryBuilder} the parent Builder.
     * @private
     */
    function _matchAllFields(fields, matchAnyRegex) {
        var regExp = regExps ? matchAnyRegex ? regExps.any : regExps.all : null;
        if (regExp) {
            for (var i = 0; i < fields.length; ++i) {
                parentBuilder.field(fields[i]).is("$regex", regExp);
            }
        }
        return parentBuilder;
    }

    /**
     * Matches the given Regular expression with at least one
     * of the fields.
     * @param {Array.<string>} fields Array of document fields.
     * @param {boolean} [matchAnyRegex=false] If true, match any
     * of the search query tokens, else match all.
     * @returns {QueryBuilder} the parent Builder.
     * @private
     */
    function _matchAnyField(fields, matchAnyRegex) {
        var regExp = regExps ? matchAnyRegex ? regExps.any : regExps.all : null;
        if (regExp) {
            var orBuilder = parentBuilder.either();
            for (var i = 0; i < fields.length; ++i) {
                orBuilder = orBuilder.or().field(fields[i]).is("$regex", regExp);
            }
        }
        return parentBuilder;
    }

    /**
     * Add fields that are to be matched with all of the search tokens.
     * @param {...string} [field] One or more fields to be matched
     * with all tokens in the search query.
     * @returns {QueryBuilder} the parent Builder. Use {@link #andSearch}()
     * to chain further with this builder.
     */
    this.in = function (field) {
        return _matchAllFields(arguments, true);
    };

    /**
     * Add fields that are to be matched with any of the search tokens.
     * @param {...string} [field] One or more fields to be matched
     * with at least one of the tokens in the search query.
     * @returns {QueryBuilder} the parent Builder. Use {@link #andSearch}()
     * to chain further with this builder.
     */
    this.anyIn = function (field) {
        return _matchAllFields(arguments, false);
    };

    /**
     * Matches all of the tokens in at least one of the fields.
     * @param {...string} [field] One or more fields to be matched
     * with all of the tokens in the search query.
     * @returns {QueryBuilder} the parent Builder. Use {@link #andSearch}()
     * to chain further with this builder.
     */
    this.inAny = function (field) {
        return _matchAnyField(arguments, true);
    };

    /**
     * Matches at least one of the tokens in at least one of the fields.
     * @param {...string} [field] One or more fields to be matched
     * with at least one of the tokens in the search query.
     * @returns {QueryBuilder} the parent Builder. Use {@link #andSearch}()
     * to chain further with this builder.
     */
    this.anyInAny = function (field) {
        return _matchAnyField(arguments, false);
    }
};

/**
 * Regular expression to split a search query string into
 * string tokens and double-quoted phrases.
 * <p>For example, the string:
 * <pre>hello wor*d I am "Shyam Dasgupta"</pre>
 * will create the following tokens:
 * <pre>["hello", "wor*d", "I", "am", "\"Shyam Dasgupta\""]</pre>
 * @type {RegExp}
 */
SearchQueryBuilder.TOKENIZE_REGEX = /(?:[^\s"]+|"[^"]*")+/g;
/**
 * If prefixed with this, the resulting Regular expression will
 * ensure that match is done at the beginning of a word. For
 * example, the token "pot" will match "Potter" and "#pottery",
 * but not "teapot", since the latter does not have pot at the
 * beginning of the word.
 * @type {string}
 */
SearchQueryBuilder.SEARCH_WORD_BEG_REGEX_PREFIX = "(^|[^a-zA-Z0-9']+)"; // "[\\b_]"; - MongoDB does not support \b

/**
 *
 * @param {string} queryStr Input string containing one or more space separated
 * tokens.
 * @param {boolean} [matchWithinWords=false] If true, matching is done anywhere.
 * By default, matching is done only at word beginnings.
 * @return {null|{all:RegExp, any:RegExp}}
 */
SearchQueryBuilder.searchQueryToRegexps = function (queryStr, matchWithinWords) {
    var regExpsStr = [];

    // read tokens
    var tokens = dataUtils.isValidStr(queryStr) ? queryStr.trim().match(SearchQueryBuilder.TOKENIZE_REGEX) : [];
    var r;
    var i;
    for (i = 0; i < tokens.length; ++i) {
        if (tokens[i].length) {
            r = tokens[i].trim()
                .replace(/^"|"$/g, "") // double-quoted phrases - trim quotes.
                .replace(/([\\\^$.|?+()\[{])/g, "\\$1") // escape Regex special chars \^$.|?+()[{ except * used for wildcards
                .replace(/\*/g, "[A-Za-z0-9_-]*"); // wildcard * - to find word characters and -
            if (r.length) {
                if (!matchWithinWords) r = SearchQueryBuilder.SEARCH_WORD_BEG_REGEX_PREFIX + r;
                if (regExpsStr.indexOf(r) < 0) regExpsStr.push(r);
                // r = new RegExp(r, "i");
                // if (!utils.arrayContainsValue(regExpsStr, r)) regExpsStr.push(r);
            }
        }
    }

    return !regExpsStr.length ? null :
        {
            // /^.*(?=.*name)(?=.*my).*$/i
            all: new RegExp("(?=.*" + regExpsStr.join(")(?=.*") + ")", "i"),
            any: new RegExp("(" + regExpsStr.join(")|(") + ")", "i")
        }
};

/**
 * This builder helps create efficient queries and expressions
 * for document fields.
 *
 * @param {QueryBuilder} parentBuilder The parent query builder.
 * @param {string} field A field in the target document.
 * @constructor
 */
var FieldQueryBuilder = function (parentBuilder, field) {
    if (!dataUtils.isValidStr(field)) throw "Invalid field, should be a string: " + dataUtils.JSONstringify(field);

    /**
     * Ensures a comparison of the field with the value.
     * @param {string} comparator e.g. "$gt", "$gte", etc.
     * @param {*} value
     * @returns {QueryBuilder} the parent Builder. Use .andField()
     * to chain further with this builder.
     */
    this.is = function (comparator, value) {
        return parentBuilder._compare(field, comparator, value);
    };

    /**
     * Ensures that the field matches the given value. This is same
     * as calling matchAll([value]).
     * @param {*} value
     * @returns {QueryBuilder} the parent Builder. Use .andField()
     * to chain further with this builder.
     */
    this.matches = function (value) {
        return parentBuilder._matchesAll(field, [value]);
    };

    /**
     * Ensures that the field matches all the values.
     * @param {Array.<*>} values
     * @returns {QueryBuilder} the parent Builder. Use .andField()
     * to chain further with this builder.
     */
    this.matchesAll = function (values) {
        return parentBuilder._matchesAll(field, values);
    };

    /**
     * Ensures that the field matches at least one of the values.
     * @param {Array.<*>} values
     * @param {boolean} [addToExistingOr=false] If true, this will
     * be added to the existing OR list ($in), if any.
     * @returns {QueryBuilder} the parent Builder. Use .andField()
     * to chain further with this builder.
     */
    this.matchesAny = function (values, addToExistingOr) {
        return parentBuilder._matchesAny(field, values, addToExistingOr);
    };
};

/**
 * This builder helps create efficient OR queries and expressions.
 * @constructor
 */
var OrQueryBuilder = function () {
    var _orBuilder = this;
    var _queries = [];
    var _currentChildBuilder = new ChildQueryBuilder(_orBuilder);

    /**
     * Process the current OR entry, and continue adding to this OR
     * query group.
     * @returns {ChildQueryBuilder} A new {@link ChildQueryBuilder}
     * child in this OR group.
     */
    this.or = function () {
        _orBuilder.flush();
        return _currentChildBuilder;
    };

    /**
     * Returns the array of query objects generated by this
     * builder.
     * @returns {Array.<{}>} the array of query objects generated
     * by this builder.
     */
    this.flush = function () {
        // save current builder
        var q = _currentChildBuilder.build();
        // only if the query is non-empty
        if (Object.keys(q).length) {
            if (!dataUtils.arrayContainsValue(_queries, q)) _queries.push(q);
            // renew current builder
            _currentChildBuilder = new ChildQueryBuilder(_orBuilder);
        }
        return _queries;
    };
};

/**
 * A subclass of QueryBuilder, spawned by the either()
 * method.
 *
 * @param {OrQueryBuilder} parentOr
 * @constructor
 */
var ChildQueryBuilder = function (parentOr) {
    QueryBuilder.call(this);

    /**
     * Continue adding to the OR query group started with
     * {@link QueryBuilder#either}().
     * @returns {ChildQueryBuilder} A new {@link ChildQueryBuilder} child in
     * this OR group.
     */
    this.or = function () {
        return parentOr.or();
    };
};

/**
 * The query builder class helps create efficient document
 * queries and expressions. In case OR queries are spawned
 * using the either() method, the final query should always
 * be obtained from the root QueryBuilder's build() method.
 *
 * @param {{}} [q] An existing query to be used as the source
 * of this query builder.
 * @constructor
 */
var QueryBuilder = function (q) {
    q = dataUtils.isJSON(q) ? q : {};

    var _builder = this;

    /**
     * The last {@link SearchQueryBuilder} generated from the
     * last {@link QueryBuilder#search}() call.
     * @type {SearchQueryBuilder}
     * @private
     */
    var _lastSearchQueryBuilder;

    /**
     * The last {@link FieldQueryBuilder} generated from the
     * last {@link QueryBuilder#field}() call.
     * @type {FieldQueryBuilder}
     * @private
     */
    var _lastFieldQueryBuilder;

    /**
     * The last {@link OrQueryBuilder} generated from the
     * last {@link QueryBuilder#field}() call.
     * @type {OrQueryBuilder}
     * @private
     */
    var _lastOrQueryBuilder;

    /**
     * Creates an $or query. If an $or exists already, both
     * the existing and this are moved to $and as entries.
     * @param {Array.<{}>} queries
     * @private
     */
    this._or = function (queries) {
        if (!queries || !queries.length) return;

        // single element $or is as good as $and
        if (queries.length == 1) {
            return _builder._and(queries);
        }
        // $and with existing $or, if any
        else if (q.$or) {
            q.$and = q.$and || [];
            q.$and.push({$or: q.$or}, {$or: queries});
            delete q.$or;
        }
        else {
            q.$or = queries;
        }
    };

    /**
     * Creates an $and query. Tries to merge query directly
     * into the main query, or as entries to an $and operator.
     * @param {Array.<{}>} queries
     * @private
     */
    this._and = function (queries) {
        // merge query, its existing $and, and the given values
        var i;
        var toBeAnded = [];
        if (Object.keys(q).length) {
            toBeAnded.push(q);
        }
        if (q.$and) {
            var aq;
            for (i = 0; i < q.$and.length; ++i) {
                aq = q.$and[i];
                if (!dataUtils.arrayContainsValue(toBeAnded, aq)) {
                    toBeAnded.push(aq);
                }
            }
            delete q.$and;
        }
        var query;
        for (i = 0; i < queries.length; ++i) {
            query = queries[i];
            if (!dataUtils.arrayContainsValue(toBeAnded, query)) {
                toBeAnded.push(query);
            }
        }
        // use the merged value as the new q
        var mergedResult = _mergeManyQueryJSONs(toBeAnded);
        q = mergedResult.shift();
        // and any residues as the new $and
        if (mergedResult.length) {
            q.$and = mergedResult;
        }
    };

    /**
     * Ensures that the field matches all the values.
     * @param {string} field A field in the target document.
     * @param {Array.<{}>} values Array of values to be matched.
     * @returns {QueryBuilder} this builder for further chaining.
     * @private
     */
    this._matchesAll = function (field, values) {
        if (!dataUtils.isValidStr(field)) throw "Invalid field, should be a string: " + dataUtils.JSONstringify(field);

        var queries = [];
        var vq;
        for (var i = 0; i < values.length; ++i) {
            vq = {};
            vq[field] = values[i];
            if (!dataUtils.arrayContainsValue(queries, vq)) {
                queries.push(vq);
            }
        }

        _builder._and(queries);
        return _builder;
    };

    /**
     * Ensures that the field matches at least one of the values.
     * @param {string} field A field in the target document.
     * @param {Array.<{}>} values Array of values to be matched.
     * @param {boolean} [addToExistingOr=false] If true, this will
     * be added to the existing OR list ($in), if any.
     * @returns {QueryBuilder} this builder for further chaining.
     * @private
     */
    this._matchesAny = function (field, values, addToExistingOr) {
        if (!dataUtils.isValidStr(field)) throw "Invalid field, should be a string: " + dataUtils.JSONstringify(field);

        if (values.length == 1 && !addToExistingOr) {
            return _builder._matchesAll(field, values);
        }

        // collect any existing 'or' values
        var existingFieldValues;
        if (addToExistingOr && q[field] && q[field].$in) {
            existingFieldValues = q[field].$in;
            // and delete them. We'll collate and add the $in again.
            if (Object.keys(q[field]).length == 1) { // field: { $in: [] }
                delete q[field];
            } else { // field: { $in: [], prop1: something, ... }
                delete q[field].$in;
            }

        } else {
            existingFieldValues = [];
        }
        // add 'values' to the 'or' list
        var v;
        for (var i = 0; i < values.length; ++i) {
            v = values[i];
            if (!dataUtils.arrayContainsValue(existingFieldValues, v)) {
                existingFieldValues.push(v);
            }
        }
        // add the 'or' list to the actual query
        if (existingFieldValues.length) {
            _builder._compare(field, "$in", existingFieldValues);
        }

        return _builder;
    };

    /**
     * Ensures the comparison of the field with value.
     * @param {string} field A field in the target document.
     * @param {string} comparator e.g. "$gt", "$gte", etc.
     * @param {*} value
     * @private
     */
    this._compare = function (field, comparator, value) {
        if (!dataUtils.isValidStr(field)) throw "Invalid field, should be a string: " + dataUtils.JSONstringify(field);
        if (!dataUtils.isValidStr(comparator)) throw "Invalid comparator, should be a string: " + dataUtils.JSONstringify(comparator);

        var cq = {};
        cq[comparator] = value;
        return _builder._matchesAll(field, [cq]);
    };

    /**
     * All other functions are by default ANDed. So
     * this is just a helper function to improve
     * readability of complex queries.
     *
     * @returns {QueryBuilder} this query builder.
     */
    this.and = function () {
        return _builder;
    };

    /**
     * Creates a new {@link SearchQueryBuilder} to search fields using
     * string queries.
     *
     * @param {string} queryStr Input string containing one or more
     * space separated tokens.
     * @param {boolean} [matchWithinWords=false] If true, matching is done anywhere.
     * By default, matching is done only at word beginnings.
     * @returns {SearchQueryBuilder} a new {@link SearchQueryBuilder}
     */
    this.search = function (queryStr, matchWithinWords) {
        return _lastSearchQueryBuilder = new SearchQueryBuilder(_builder, queryStr, matchWithinWords);
    };

    /**
     * Continue more query chaining with the last {@link SearchQueryBuilder}
     * from the last {@link QueryBuilder#search}() call.
     *
     * @returns {SearchQueryBuilder} the last {@link SearchQueryBuilder}
     * from the last {@link QueryBuilder#search}() call.
     */
    this.andSearch = function () {
        if (!_lastSearchQueryBuilder) throw "Illegal andSearch() call: Should be called only after search() was called!";
        return _lastSearchQueryBuilder;
    };

    /**
     * Creates a new {@link FieldQueryBuilder} to create queries
     * for document fields.
     *
     * @param {string} field A field in the target document.
     * @returns {FieldQueryBuilder} a new {@link FieldQueryBuilder}.
     */
    this.field = function (field) {
        return _lastFieldQueryBuilder = new FieldQueryBuilder(_builder, field);
    };

    /**
     * Continue more query chaining with the last {@link FieldQueryBuilder}
     * generated from the last {@link QueryBuilder#field}() call.
     * @returns {FieldQueryBuilder} the last {@link FieldQueryBuilder}
     * generated from the last {@link QueryBuilder#field}() call.
     */
    this.andField = function () {
        if (!_lastFieldQueryBuilder) throw "Illegal andField() call: Should be called only after field() was called!";
        return _lastFieldQueryBuilder;
    };

    /**
     * Starts an OR query builder.
     * @returns {ChildQueryBuilder} A new {@link ChildQueryBuilder} child in
     * this OR group.
     */
    this.either = function () {
        if (_lastOrQueryBuilder) _builder.build();
        _lastOrQueryBuilder = new OrQueryBuilder(_builder);
        return _lastOrQueryBuilder.or();
    };

    /**
     * Returns the final query object built.
     * @returns {{}} the final query object built.
     */
    this.build = function () {
        if (_lastOrQueryBuilder) {
            _builder._or(_lastOrQueryBuilder.flush());
        }
        return q;
    };
};


/**
 * Merges two query JSONs, as much as possible, and returns
 * the merged and optionally a residual JSON in an array.
 * The merged and residual entries will have at least
 * one common field with different values, that could not
 * be merged.
 * <p>Merging happens recursively across field values.
 * @param {{}} j1 first JSON
 * @param {{}} j2 second JSON
 * @return {Array.<{}>} Array of JSONs, where the first
 * entry is the merged JSON, and an optional second
 * JSON is a residual JSON that has at least one field
 * common with the merged JSON, but with a different value
 * that could not be merged.
 * @private
 */
function _mergeQueryJSONs(j1, j2) {
    // if same, return one
    if (dataUtils.deepEquals(j1, j2)) {
        return [j1];
    }
    var isJ1JSON = dataUtils.isJSON(j1);
    var isJ2JSON = dataUtils.isJSON(j2);
    // return as it is, if none is a JSON
    if (!isJ1JSON && !isJ2JSON) {
        return [j1, j2];
    }

    // if either is not a JSON, return both,
    // but keep the JSON as the first (merged)
    else if (isJ1JSON && !isJ2JSON) {
        return [j1, j2];
    }
    else if (!isJ1JSON && isJ2JSON) {
        return [j2, j1];
    }

    var merged = {};
    var residue = {};

    var j1Keys = Object.keys(j1).sort();
    var j2Keys = Object.keys(j2).sort();

    var i, j, key, mergedChildren;
    // merge j1 properties
    for (i = 0; i < j1Keys.length; ++i) {
        key = j1Keys[i];
        // add properties unique to j1
        if (!j2.hasOwnProperty(key) || dataUtils.deepEquals(j1[key], j2[key])) {
            merged[key] = j1[key];
        }
        // merge keys present in both the JSONs
        else {
            // combine $in operators for the same field
            if (j1[key].$in && j2[key].$in) {
                for (j = 0; j < j2[key].$in.length; ++j) {
                    if (j1[key].$in.indexOf(j2[key].$in[j]) < 0) {
                        j1[key].$in.push(j2[key].$in[j]);
                    }
                }
                delete j2[key].$in;
            }

            // merge remaining operators
            mergedChildren = _mergeQueryJSONs(j1[key], j2[key]);
            if (mergedChildren.length > 0) merged[key] = mergedChildren[0];
            if (mergedChildren.length > 1) residue[key] = mergedChildren[1];
        }
    }
    // add properties unique to j2
    for (i = 0; i < j2Keys.length; ++i) {
        key = j2Keys[i];
        if (!j1.hasOwnProperty(key)) {
            merged[key] = j2[key];
        }
    }

    var result = [];
    if (Object.keys(merged).length) result.push(merged);
    if (Object.keys(residue).length) result.push(residue);
    return result;
}

/**
 * Merges all query JSONs as much as possible, and returns
 * the merged and optionally the residual JSONs in an
 * array.
 * <p>Merging happens recursively across field values.
 * @param {Array.<{}>} jsonArray Array of JSONs to be
 * merged.
 * @return {Array.<{}>} Array of JSONs, where the first
 * entry is the merged JSON, and the remaining optional
 * JSONs are residues that have at least field common,
 * but with a different value that could not be merged.
 * @private
 */
function _mergeManyQueryJSONs(jsonArray) {
    if (!jsonArray.length || jsonArray.length == 1) return jsonArray;

    var merged = jsonArray[0];
    var residues = [];
    var mergedResult;
    for (var i = 1; i < jsonArray.length; ++i) {
        mergedResult = _mergeQueryJSONs(merged, jsonArray[i]);
        merged = mergedResult[0];
        if (mergedResult.length == 2) residues.push(mergedResult[1]);
    }
    // merge the residues recursively
    residues = _mergeManyQueryJSONs(residues);
    // done. Add merged as first, and return.
    residues.unshift(merged);
    return residues;
}

module.exports = {
    QueryBuilder: QueryBuilder,
    FieldQueryBuilder: FieldQueryBuilder,
    SearchQueryBuilder: SearchQueryBuilder
};