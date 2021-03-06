
// Table Widget: Format an array of RDF statements as an HTML table.
//
// This can operate in one of three modes: when the class of object is given
// or when the source document from whuch data is taken is given,
// or if a prepared query object is given.
// (In principle it could operate with neither class nor document 
// given but typically
// there would be too much data.)
// When the tableClass is not given, it looks for common  classes in the data,
// and gives the user the option.
//
// 2008 Written, Ilaria Liccardi  asthe tableViewPane.js
// 2014 Core table widget moved into common/table.js - timbl
//

tabulator.panes.utils.renderTableViewPane = function renderTableViewPane(doc, options) {
    var sourceDocument = options.sourceDocument;
    var tableClass = options.tableClass;
    var givenQuery = options.query;

    var RDFS_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
    var RDFS_LITERAL = "http://www.w3.org/2000/01/rdf-schema#Literal";
    var ns = tabulator.ns;
    var kb = tabulator.kb;

    // Predicates that are never made into columns:

    var FORBIDDEN_COLUMNS = {
        "http://www.w3.org/2002/07/owl#sameAs": true,
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#type": true
    };

    // Number types defined in the XML schema:

    var XSD_NUMBER_TYPES = {
        "http://www.w3.org/2001/XMLSchema#decimal": true,
        "http://www.w3.org/2001/XMLSchema#float": true,
        "http://www.w3.org/2001/XMLSchema#double": true,
        "http://www.w3.org/2001/XMLSchema#integer": true,
        "http://www.w3.org/2001/XMLSchema#nonNegativeInteger": true,
        "http://www.w3.org/2001/XMLSchema#positiveInteger": true,
        "http://www.w3.org/2001/XMLSchema#nonPositiveInteger": true,
        "http://www.w3.org/2001/XMLSchema#negativeInteger": true,
        "http://www.w3.org/2001/XMLSchema#long": true,
        "http://www.w3.org/2001/XMLSchema#int": true,
        "http://www.w3.org/2001/XMLSchema#short": true,
        "http://www.w3.org/2001/XMLSchema#byte": true,
        "http://www.w3.org/2001/XMLSchema#unsignedLong": true,
        "http://www.w3.org/2001/XMLSchema#unsignedInt": true,
        "http://www.w3.org/2001/XMLSchema#unsignedShort": true,
        "http://www.w3.org/2001/XMLSchema#unsignedByte": true
    };

    var XSD_DATE_TYPES = {
        "http://www.w3.org/2001/XMLSchema#dateTime": true,
        "http://www.w3.org/2001/XMLSchema#date": true
    };

    // Classes that indicate an image:

    var IMAGE_TYPES = {
        'http://xmlns.com/foaf/0.1/Image': true,
        'http://purl.org/dc/terms/Image': true
    };

    // Name of the column used as a "key" value to look up the row.
    // This is necessary because in the normal view, the columns are
    // all "optional" values, meaning that we will get a result set 
    // for every individual value that is found.  The row key acts
    // as an anchor that can be used to combine this information
    // back into the same row.

    var ROW_KEY_COLUMN = "_row";

    // Use queries to render the table, currently experimental:
 
    var USE_QUERIES = true;

    var subjectIdCounter = 0;
    var allType, types;
    var typeSelectorDiv, addColumnDiv;

    // The last SPARQL query used:
    var lastQuery = null;
    var mostCommonType = null;

    var resultDiv = doc.createElement("div");
    resultDiv.className = "tableViewPane";

    resultDiv.appendChild(generateControlBar()); // sets typeSelectorDiv

    var tableDiv = doc.createElement("div");
    resultDiv.appendChild(tableDiv);


    // Save a refresh function for use by caller
    resultDiv.refresh = function() {
        updateTable(givenQuery, mostCommonType); // This could be a lot more incremental and efficient
    }


    // A specifically asked-for query
    if (givenQuery) {
    
        var table = renderTableForQuery(givenQuery);
        //lastQuery = givenQuery;
        tableDiv.appendChild(table);

        
        
    } else {

        // Find the most common type and select it by default

        var s = calculateTable(); allType = s[0]; types = s[1];
        if (!tableClass) typeSelectorDiv.appendChild(
            generateTypeSelector(allType, types));

        mostCommonType = getMostCommonType(types);

        if (mostCommonType != null) {
            buildFilteredTable(mostCommonType);
        } else {
            buildFilteredTable(allType);
        }
    }
    return resultDiv;
    
    
    ///////////////////////////////////////////////////////////////////
    

    function closeDialog(dialog) {
        dialog.parentNode.removeChild(dialog);
    }

    function createActionButton(label, callback) {
        var button = doc.createElement("input");
        button.setAttribute("type", "submit");
        button.setAttribute("value", label);
        button.addEventListener("click", callback, false);
        return button;
    }

    function createSparqlWindow() {
        var dialog = doc.createElement("div");

        dialog.setAttribute("class", "sparqlDialog");

        var title = doc.createElement("h3");
        title.appendChild(doc.createTextNode("Edit SPARQL query"));

        var inputbox = doc.createElement("textarea");
        inputbox.value = queryToSPARQL(lastQuery);

        dialog.appendChild(title);
        dialog.appendChild(inputbox);

        dialog.appendChild(createActionButton("Query", function() {
            var query = SPARQLToQuery(inputbox.value);
            updateTable(query);
            closeDialog(dialog);
        }));

        dialog.appendChild(createActionButton("Close", function() {
            closeDialog(dialog);
        }));

        return dialog;
    }

    function sparqlButtonPressed() {
        var dialog = createSparqlWindow();

        resultDiv.appendChild(dialog);
    }

    function generateSparqlButton() {
        var image = doc.createElement("img");
        image.setAttribute("class", "sparqlButton");
        image.setAttribute("src", tabulator.iconPrefix + "icons/1pt5a.gif");
        image.setAttribute("alt", "Edit SPARQL query");

        image.addEventListener("click", sparqlButtonPressed, false);

        return image;
    }

    // Generate the control bar displayed at the top of the screen.

    function generateControlBar() {
        var result = doc.createElement("table");
        result.setAttribute("class", "toolbar");

        var tr = doc.createElement("tr");
        
/*             @@    Add in later -- not debugged yet 
        var sparqlButtonDiv = doc.createElement("td");
        sparqlButtonDiv.appendChild(generateSparqlButton());
        tr.appendChild(sparqlButtonDiv);
*/
        typeSelectorDiv = doc.createElement("td");
        tr.appendChild(typeSelectorDiv);

        addColumnDiv = doc.createElement("td");
        tr.appendChild(addColumnDiv);

        result.appendChild(tr);

        return result;
    }

    // Add the SELECT details to the query being built.

    function addSelectToQuery(query, type) {
        var selectedColumns = type.getColumns();

        for (var i=0; i<selectedColumns.length; ++i) {
            // TODO: autogenerate nicer names for variables
            // variables have to be unambiguous

            var variable = kb.variable("_col" + i);

            query.vars.push(variable);
            selectedColumns[i].setVariable(variable);
        }
    }

    // Add WHERE details to the query being built.

    function addWhereToQuery(query, rowVar, type) {
        var queryType = type.type;

        if (queryType == null) {
            queryType = kb.variable("_any");
        }

        // _row a type
        query.pat.add(rowVar,
                      tabulator.ns.rdf("type"),
                      queryType);
    }

    // Generate OPTIONAL column selectors.

    function addColumnsToQuery(query, rowVar, type) {
        var selectedColumns = type.getColumns();

        for (var i=0; i<selectedColumns.length; ++i) {
            var column = selectedColumns[i];

            var formula = kb.formula();

            formula.add(rowVar,
                        column.predicate,
                        column.getVariable());

            query.pat.optional.push(formula);
        }
    }

    // Generate a query object from the currently-selected type
    // object.

    function generateQuery(type) {
        var query = new tabulator.rdf.Query();
        var rowVar = kb.variable(ROW_KEY_COLUMN);

        addSelectToQuery(query, type);
        addWhereToQuery(query, rowVar, type);
        addColumnsToQuery(query, rowVar, type);

        return query;
    }

    // Build the contents of the tableDiv element, filtered according
    // to the specified type.

    function buildFilteredTable(type) {

        // Generate "add column" cell.

        clearElement(addColumnDiv);
        addColumnDiv.appendChild(generateColumnAddDropdown(type));

        var query = generateQuery(type);

        updateTable(query, type);
    }

    function updateTable(query, type) {

        // Stop the previous query from doing any updates.

        if (lastQuery != null) {
            lastQuery.running = false;
        }

        // Render the HTML table.

        var htmlTable = renderTableForQuery(query, type);

        // Clear the tableDiv element, and replace with the new table.

        clearElement(tableDiv);
        tableDiv.appendChild(htmlTable);

        // Save the query for the edit dialog.

        lastQuery = query;
        
        
    }

    // Remove all subelements of the specified element.

    function clearElement(element) {
        while (element.childNodes.length > 0) {
            element.removeChild(element.childNodes[0]);
        }
    }

    // A SubjectType is created for each rdf:type discovered.

    function SubjectType(type) {
        this.type = type;
        this.columns = null;
        this.allColumns = null;
        this.useCount = 0;

        // Get a list of all columns used by this type.

        this.getAllColumns = function() {
            return this.allColumns;
        }

        // Get a list of the current columns used by this type
        // (subset of allColumns)

        this.getColumns = function() {

            // The first time through, get a list of all the columns
            // and select only the six most popular columns.

            if (this.columns == null) {
                var allColumns = this.getAllColumns();
                this.columns = allColumns.slice(0, 7);
            }

            return this.columns;
        }

        // Get a list of unused columns

        this.getUnusedColumns = function() {
            var allColumns = this.getAllColumns();
            var columns = this.getColumns();

            var result = [];

            for (var i=0; i<allColumns.length; ++i) {
                if (columns.indexOf(allColumns[i]) == -1) {
                    result.push(allColumns[i]);
                }
            }

            return result;
        }

        this.addColumn = function(column) {
            this.columns.push(column);
        }

        this.removeColumn = function(column) {
            this.columns = this.columns.filter(function(x) {
                return x != column;
            })
        }

        this.getLabel = function() {
            return tabulator.Util.label(this.type);
        }

        this.addUse = function() {
            this.useCount += 1;
        }
    }

    // Class representing a column in the table.

    function Column() {
        this.useCount = 0;

        // Have we checked any values for this column yet?

        this.checkedAnyValues = false;

        // If the range is unknown, but we just get literals in this
        // column, then we can generate a literal selector.

        this.possiblyLiteral = true;

        // If the range is unknown, but we just get literals and they
        // match the regular expression for numbers, we can generate
        // a number selector.

        this.possiblyNumber = true;
        
        // We accumulate classes which things in the column must be a member of
        
        this.constraints = [];

        // Check values as they are read.  If we don't know what the
        // range is, we might be able to infer that it is a literal
        // if all of the values are literals.  Similarly, we might
        // be able to determine if the literal values are actually
        // numbers (using regexps).

        this.checkValue = function(term) {
            var termType = term.termType;
            if (this.possiblyLiteral && termType != "literal" && termType != "symbol") {
                this.possiblyNumber = false;
                this.possiblyLiteral = false;
            } else if (this.possiblyNumber) {
                if (termType != "literal") {
                    this.possiblyNumber = false;
                } else {
                    var literalValue = term.value;

                    if (!literalValue.match(/^\-?\d+(\.\d*)?$/)) {
                        this.possiblyNumber = false;
                    }
                }
            }

            this.checkedAnyValues = true;
        }

        this.getVariable = function() {
            return this.variable;
        }

        this.setVariable = function(variable) {
            this.variable = variable;
        }

        this.getKey = function() {
            return this.variable.toString();
        }

        this.addUse = function() {
            this.useCount += 1;
        }

        this.getLabel = function() {
            if (this.predicate != null) {
                if (this.predicate.sameTerm(ns.rdf('type')) && this.superClass) {
                    return tabulator.Util.label(this.superClass)
                }
                return tabulator.Util.label(this.predicate);
            } else if (this.variable != null) {
                return this.variable.toString();
            } else {
                return "unlabeled column?";
            }
        }

        this.setPredicate = function(predicate, inverse, other) {
            if (inverse) {  // variable is in the subject pos
                this.inverse = predicate;
                this.constraints = this.constraints.concat(
                            kb.each(predicate, tabulator.ns.rdfs("domain")));
                if (predicate.sameTerm(ns.rdfs('subClassOf')) && (other.termType == 'symbol')) {
                    this.superClass = other;
                    this.alternatives = kb.each(undefined, ns.rdfs('subClassOf'), other)
                }
            } else {  // variable is the object
                this.predicate = predicate;
                this.constraints = this.constraints.concat(kb.each(predicate, tabulator.ns.rdfs("range")));
            }
        }


        this.getConstraints = function() {
            return this.constraints;
        }

        this.filterFunction = function() {
            return true;
        }

        this.sortKey = function() {
            return this.getLabel().toLowerCase();
        }

        this.isImageColumn = function() {
            for (var i=0; i<this.constraints.length; i++)
                if (this.constraints[i].uri in IMAGE_TYPES) return true;
            return false;
        }
    }

    // Convert an object to an array.

    function objectToArray(obj, filter) {
        var result = [];

        for (var property in obj) {    // @@@ have to guard against methods
            var value = obj[property];

            if (!filter || filter(property, value)) {
                result.push(value);
            }
        }

        return result;
    }

    // Get the list of valid columns from the columns object.

    function getColumnsList(columns) {
        return objectToArray(columns);
    }

    // Generate an <option> in a drop-down list.

    function optionElement(label, value) {
        var result = doc.createElement("option");

        result.setAttribute("value", value);
        result.appendChild(doc.createTextNode(label));

        return result;
    }

    // Generate drop-down list box for choosing type of data displayed

    function generateTypeSelector(allType, types) {
        var resultDiv = doc.createElement("div");

        resultDiv.appendChild(doc.createTextNode("Select type: "));

        var dropdown = doc.createElement("select");

        dropdown.appendChild(optionElement("All types", "null"));

        for (var uri in types) {
            dropdown.appendChild(optionElement(types[uri].getLabel(), uri));
        }

        dropdown.addEventListener("click", function() {
            var type;

            if (dropdown.value == "null") {
                type = allType;
            } else {
                type = types[dropdown.value];
            }

            typeSelectorChanged(type);
        }, false);

        resultDiv.appendChild(dropdown);

        return resultDiv;
    }

    // Callback invoked when the type selector drop-down list is changed.

    function typeSelectorChanged(selectedType) {
        buildFilteredTable(selectedType);
    }

    // Build drop-down list to add a new column

    function generateColumnAddDropdown(type) {
        var resultDiv = doc.createElement("div");

        var unusedColumns = type.getUnusedColumns();

        unusedColumns.sort(function(a, b) {
            var aLabel = a.sortKey();
            var bLabel = b.sortKey();
            return (aLabel > bLabel) - (aLabel < bLabel);
        });

        // If there are no unused columns, the div is empty.

        if (unusedColumns.length > 0) {

            resultDiv.appendChild(doc.createTextNode("Add column: "));

            // Build dropdown list of unused columns.

            var dropdown = doc.createElement("select");

            dropdown.appendChild(optionElement("", "-1"));

            for (var i=0; i<unusedColumns.length; ++i) {
                var column = unusedColumns[i];
                dropdown.appendChild(optionElement(column.getLabel(), "" + i));
            }

            resultDiv.appendChild(dropdown);

            // Invoke callback when the dropdown is changed, to add
            // the column and reload the table.

            dropdown.addEventListener("click", function() {
                var columnIndex = new Number(dropdown.value);

                if (columnIndex >= 0) {
                    type.addColumn(unusedColumns[columnIndex]);
                    buildFilteredTable(type);
                }
            }, false);
        }

        return resultDiv;
    }

    // Find the column for a given predicate, creating a new column object
    // if necessary.

    function getColumnForPredicate(columns, predicate) {

        var column;

        if (predicate.uri in columns) {
            column = columns[predicate.uri];
        } else {
            column = new Column();
            column.setPredicate(predicate);
            columns[predicate.uri] = column;
        }

        return column;
    }

    // Find a type by its URI, creating a new SubjectType object if
    // necessary.

    function getTypeForObject(types, type) {
        var subjectType;

        if (type.uri in types) {
            subjectType = types[type.uri];
        } else {
            subjectType = new SubjectType(type);
            types[type.uri] = subjectType;
        }

        return subjectType;
    }

    // Discover types and subjects for search.

    function discoverTypes() {

        // rdf:type properties of subjects, indexed by URI for the type.

        var types = {};

        // Get a list of statements that match:  ? rdfs:type ?
        // From this we can get a list of subjects and types.

        var subjectList = kb.statementsMatching(undefined,
                                                tabulator.ns.rdf('type'),
                                                tableClass, // can be undefined OR
                                                sourceDocument); // can be undefined

        // Subjects for later lookup.  This is a mapping of type URIs to
        // lists of subjects (it is necessary to record the type of
        // a subject).

        var subjects = {};
        // dump("discoverTypes - subjectList.length "+subjectList.length+
         //       " tableClass:"+tableClass+", sourceDocument="+sourceDocument+"\n");
        for (var i=0; i<subjectList.length; ++i) {
            var type = subjectList[i].object;
            // dump("discoverTypes - type "+type+"\n");

            if (type.termType != "symbol") {   // @@ no bnodes?
                continue;
            }

            var typeObj = getTypeForObject(types, type);

            if (!(type.uri in subjects)) {
                subjects[type.uri] = [];
            }

            subjects[type.uri].push(subjectList[i].subject);
            typeObj.addUse();
        }

        return [ subjects, types ];
    }

    // Get columns for the given subject.

    function getSubjectProperties(subject, columns) {
        // dump("getSubjectProperties: "+subject+"\n");

        // Get a list of properties of this subject.

        var properties = kb.statementsMatching(subject,
                                               undefined,
                                               undefined,
                                               sourceDocument);

        var result = {};

        for (var j=0; j<properties.length; ++j) {
            var predicate = properties[j].predicate;

            if (predicate.uri in FORBIDDEN_COLUMNS) {
                continue;
            }

            // Find/create a column for this predicate.

            var column = getColumnForPredicate(columns, predicate);
            column.checkValue(properties[j].object);
            // dump("Found predicate: "+predicate+"\n");

            result[predicate.uri] = column;
        }

        return result;
    }

    // Identify the columns associated with a type.

    function identifyColumnsForType(type, subjects) {
        // dump("identifyColumnsForType\n");

        var allColumns = {};

        // Process each subject of this type to build up the
        // column list.

        for (var i=0; i<subjects.length; ++i) {

            var columns = getSubjectProperties(subjects[i], allColumns);

            for (var predicateUri in columns) {

                var column = columns[predicateUri];

                column.addUse();
            }
        }

        // Generate the columns list

        var allColumnsList = objectToArray(allColumns);
        sortColumns(allColumnsList);
        type.allColumns = allColumnsList;
    }

    // Build table information from parsing RDF statements.

    function calculateTable() {
        // dump("calculateTable\n");

        // Find the types that we will display in the dropdown
        // list box, and associated objects of those types.

        var subjects, types;

        var s = discoverTypes(); subjects = s[0]; types = s[1]; // no [ ] on LHS

        for (var typeUrl in subjects) {
            // dump("calculateTable - typeUrl"+typeUrl+"\n");
            var subjectList = subjects[typeUrl];
            var type = types[typeUrl];

            identifyColumnsForType(type, subjectList);
        }

        // TODO: Special type that captures all rows.
        // Combine columns from all types

        var allType = new SubjectType(null);

        return [ allType, objectToArray(types) ];
    }

    // Sort the list of columns by the most common columns.

    function sortColumns(columns) {
        function sortFunction(a, b) {
            return (a.useCount < b.useCount) - (a.useCount > b.useCount);
        }

        columns.sort(sortFunction);
    }

    // Create the delete button for a column.

    function renderColumnDeleteButton(type, column) {
        var button = doc.createElement("a");

        button.appendChild(doc.createTextNode("[x]"));

        button.addEventListener("click", function() {
            type.removeColumn(column);
            buildFilteredTable(type);
        }, false);

        return button;
    }

    // Render the table header for the HTML table.

    function renderTableHeader(columns, type) {
        // dump(" renderTableHeader type = "+type+", columns.length = "+columns.length+"\n");
        var tr = doc.createElement("tr");

        /* Empty header for link column */
        var linkTd = doc.createElement("th");
        tr.appendChild(linkTd);

        /*
        var labelTd = doc.createElement("th");
        labelTd.appendChild(doc.createTextNode("*label*"));
        tr.appendChild(labelTd);
        */

        for (var i=0; i<columns.length; ++i) {
            var th = doc.createElement("th");
            var column = columns[i];

            // dump(" label for columns "+i+" is <"+column.getLabel()+">\n");
            th.appendChild(doc.createTextNode(column.getLabel()));

            // We can only add a delete button if we are using the
            // proper interface and have a type to delete from:
            if (type != null) {
                th.appendChild(renderColumnDeleteButton(type, column));
            }

            tr.appendChild(th);
        }

        return tr;
    }

    // Sort the rows in the rendered table by data from a specific
    // column, using the provided sort function to compare values.

    function applyColumnSort(rows, column, sortFunction, reverse) {
        var columnKey = column.getKey();

        // Sort the rows array.
        rows.sort(function(row1, row2) {
            var row1Value = null, row2Value = null;

            if (columnKey in row1) {
                row1Value = row1[columnKey][0];
            }
            if (columnKey in row2) {
                row2Value = row2[columnKey][0];
            }

            var result = sortFunction(row1Value, row2Value);

            if (reverse) {
                return -result;
            } else {
                return result;
            }
        })

        // Remove all rows from the table:

        if (rows.length) {
            var parentTable = rows[0]._htmlRow.parentNode;

            for (var i=0; i<rows.length; ++i) {
                parentTable.removeChild(rows[i]._htmlRow);
            }

            // Add back the rows in the new sorted order:

            for (var i=0; i<rows.length; ++i) {
                parentTable.appendChild(rows[i]._htmlRow);
            }
        };
    }

    // Filter the list of rows based on the selectors for the 
    // columns.

    function applyColumnFilters(rows, columns) {

        // Apply filterFunction to each row.

        for (var r=0; r<rows.length; ++r) {
            var row = rows[r];
            var rowDisplayed = true;

            // Check the filter functions for every column.
            // The row should only be displayed if the filter functions
            // for all of the columns return true.

            for (var c=0; c<columns.length; ++c) {
                var column = columns[c];
                var columnKey = column.getKey();

                var columnValue = null;

                if (columnKey in row) {
                    columnValue = row[columnKey][0];
                }

                if (!column.filterFunction(columnValue)) {
                    rowDisplayed = false;
                    break;
                }
            }

            // Show or hide the HTML row according to the result
            // from the filter function.

            var htmlRow = row._htmlRow;

            if (rowDisplayed) {
                htmlRow.style.display = "";
            } else {
                htmlRow.style.display = "none";
            }
        }
    }
    
    ///////////////////////////////////// Literal column handling

    // Sort by literal value

    function literalSort(rows, column, reverse) {
        function literalToString(colValue) {
            if (colValue != null) {
                if (colValue.termType == "literal") {
                    return colValue.value.toLowerCase();
                } else if (colValue.termType == "symbol") {
                    return tabulator.Util.label(colValue).toLowerCase() ;
                };
                return colValue.value.toLowerCase();
            } else {
                return "";
            }
        }

        function literalCompare(value1, value2) {
            var strValue1 = literalToString(value1);
            var strValue2 = literalToString(value2);

            if (strValue1 < strValue2) {
                return -1;
            } else if (strValue1 > strValue2) {
                return 1;
            } else {
                return 0;
            }
        }

        applyColumnSort(rows, column, literalCompare, reverse);
    }

    // Generates a selector for an RDF literal column.

    function renderLiteralSelector(rows, columns, column) {
        var result = doc.createElement("div");

        var textBox = doc.createElement("input");
        textBox.setAttribute("type", "text");
        textBox.style.width = "70%";

        result.appendChild(textBox);

        var sort1 = doc.createElement("span");
        sort1.appendChild(doc.createTextNode("\u25BC"));
        sort1.addEventListener("click", function() {
            literalSort(rows, column, false);
        }, false)
        result.appendChild(sort1);

        var sort2 = doc.createElement("span");
        sort2.appendChild(doc.createTextNode("\u25B2"));
        sort2.addEventListener("click", function() {
            literalSort(rows, column, true);
        }, false);
        result.appendChild(sort2);

        var substring = null;

        // Filter the table to show only rows that have a particular 
        // substring in the specified column.

        column.filterFunction = function(colValue) {
            if (substring == null) {
                return true;
            } else if (colValue == null) {
                return false;
            } else {
                var literalValue;

                if (colValue.termType == "literal") {
                    literalValue = colValue.value;
                } else if (colValue.termType == "symbol") {
                    literalValue = tabulator.Util.label(colValue) ;
                } else {
                    literalValue = "";
                }

                return literalValue.toLowerCase().indexOf(substring) >= 0;
            }
        }

        textBox.addEventListener("keyup", function() {
            if (textBox.value != "") {
                substring = textBox.value.toLowerCase();
            } else {
                substring = null;
            }

            applyColumnFilters(rows, columns);
        }, false);

        return result;
    }

    /////////////////////////////////////  Enumeration

    // Generates a dropdown selector for enumeration types include
    //
    //  @param rows,
    //  @param columns, the mapping of predictae URIs to columns
    //  @param column,
    //  @param list,    List of alternative terms
    //
    function renderEnumSelector(rows, columns, column, list) {
        var doMultiple = true;
        var result = doc.createElement("div");
        var dropdown = doc.createElement("select");

        var searchValue = {}; // Defualt to all enabled
        for (var i=0; i<list.length; ++i) {
            var value = list[i];
            searchValue[value.uri] = true;
        }
        
        var initialSelection = hints(column).initialSelection;
        if (initialSelection) searchValue = initialSelection;

        if (doMultiple) dropdown.setAttribute('multiple', 'true');
        else dropdown.appendChild(optionElement("(All)", "-1"));
        
        for (var i=0; i<list.length; ++i) {
            var value = list[i];
            var ele = optionElement(tabulator.Util.label(value), i);
            if (searchValue[value.uri]) ele.selected = true;
            dropdown.appendChild(ele);
        }
        result.appendChild(dropdown);

        // Select based on an enum value.

        column.filterFunction = function(colValue) {
            return searchValue == null ||
                   (colValue != null && searchValue[colValue.uri]);
        }

        dropdown.addEventListener("click", function() {
            if (doMultiple) {
                searchValue = {}; 
                var opt = dropdown.options;
                // dump('dropdown '+dropdown+', options a '+typeof dropdown.options +'\n') // +' array? '+ dropdown.options instanceof Array
                for (var i=0; i< opt.length; i++) {
                    var option = opt[i];
                    var index = new Number(option.value);
                    if (opt[i].selected) searchValue[list[index].uri] = true;
                }
//                dropdown.options.map(function(option){
//                    if (option.selected) searchValue[list[0+option.value].uri] = true})
                // dump('searchValue:'); for (var x in searchValue) dump(' '+x+': '+searchValue[x]+'; '); // @@TBL
                // dump('\n'); // @@TBL
                
                } else {
                    if (index < 0) { // All
                        searchValue = null;
                } else {
                    var index = new Number(dropdown.value);
                    searchValue = {}
                    searchValue[list[index].uri] = true;
                }
            }
            applyColumnFilters(rows, columns);
        }, true);

        return result;
    }

    ////////////////////////////////////// Numeric
    //
    // Selector for XSD number types.

    function renderNumberSelector(rows, columns, column) {
        var result = doc.createElement("div");

        var minSelector = doc.createElement("input");
        minSelector.setAttribute("type", "text");
        minSelector.style.width = "40px";
        result.appendChild(minSelector);

        var maxSelector = doc.createElement("input");
        maxSelector.setAttribute("type", "text");
        maxSelector.style.width = "40px";
        result.appendChild(maxSelector);

        // Select based on minimum/maximum limits.

        var min = null;
        var max = null;

        column.filterFunction = function(colValue) {
            if (colValue != null) {
                colValue = new Number(colValue);
            }

            if (min != null && (colValue == null || colValue < min)) {
                return false;
            }
            if (max != null && (colValue == null || colValue > max)) {
                return false;
            }

            return true;
        }

        // When the values in the boxes are changed, update the 
        // displayed columns.

        function eventListener() {
            if (minSelector.value == "") {
                min = null;
            } else {
                min = new Number(minSelector.value);
            }

            if (maxSelector.value == "") {
                max = null;
            } else {
                max = new Number(maxSelector.value);
            }

            applyColumnFilters(rows, columns);
        }

        minSelector.addEventListener("keyup", eventListener, false);
        maxSelector.addEventListener("keyup", eventListener, false);

        return result;
    }

    ///////////////////////////////////////////////////////////////////
    
    
    // Fallback attempts at generating a selector if other attempts fail.

    function fallbackRenderTableSelector(rows, columns, column) {


        // Have all values matched as numbers?

        if (column.checkedAnyValues && column.possiblyNumber) {
            return renderNumberSelector(rows, columns, column);
        }

        // Have all values been literals?

        if (column.possiblyLiteral) {
            return renderLiteralSelector(rows, columns, column);
        }

        return null;
    }

    // Render a selector for a given row.

    function renderTableSelector(rows, columns, column) {

        // What type of data is in this column?  Check the constraints for 
        // this predicate.

        // If this is a class which can be one of various sibling classes?
        if (column.superClass && (column.alternatives.length > 0)) 
                return renderEnumSelector(rows, columns, column, column.alternatives);

        var cs = column.getConstraints();
        // dump('column.constraints ='+cs+', .length '+cs.length+', type= '+typeof cs+'\n')
        // var cons = cs.map(function(c){return tabulator.Util.label(c)}).join(', ');
        // dump(' column '+column.variable+'  Pred: '+column.predicate+'  superClass: '+column.superClass+'\n');
        var range;
        for (i=0; i<cs.length; i++) {
            range = cs[i];

            // Is this a number type?
            // Alternatively, is this an rdf:Literal type where all of 
            // the values match as numbers?

            if (column.checkedAnyValues && column.possiblyNumber 
             || range.uri in XSD_NUMBER_TYPES) {
                return renderNumberSelector(rows, columns, column);
            }

            // rdf:Literal?  Assume a string at this point

            if (range.uri == RDFS_LITERAL) {
                return renderLiteralSelector(rows, columns, column);
            }

            // Is this an enumeration type?

            // Also  ToDo: @@@ Handle membership of classes whcih are disjointUnions
            
            var choices = kb.each(range,tabulator.ns.owl("oneOf"));
            if (choices.length > 0)
                return renderEnumSelector(rows, columns, column, choices.elements);
            
        }
        return fallbackRenderTableSelector(rows, columns, column);
    }

    // Generate the search selectors for the table columns.

    function renderTableSelectors(rows, columns) {
        var tr = doc.createElement("tr");
        tr.className = "selectors";

        // Empty link column

        tr.appendChild(doc.createElement("td"));

        // Generate selectors.

        for (var i=0; i<columns.length; ++i) {
            var td = doc.createElement("td");

            var selector = renderTableSelector(rows, columns, columns[i]);

            if (selector != null) {
                td.appendChild(selector);
            }
/*
            // Useful debug: display URI of predicate in column header
            if (columns[i].predicate.uri != null) {
                td.appendChild(document.createTextNode(columns[i].predicate.uri));
            }
*/
            tr.appendChild(td);
        }

        return tr;
    }

    function linkTo(uri, linkText) {
        var result = doc.createElement("a");
        result.setAttribute("href", uri);
        result.appendChild(doc.createTextNode(linkText));
        result.addEventListener('click',
            tabulator.panes.utils.openHrefInOutlineMode, true);
        return result;
    }

    function linkToObject(obj) {
        var match = false;

        if (obj.uri != null) {
            match = obj.uri.match(/^mailto:(.*)/);
        }

        if (match) {
            return linkTo(obj.uri, match[1]);
        } else {
            return linkTo(obj.uri, tabulator.Util.label(obj));
        }
    }

    // Render an image

    function renderImage(obj) {
        var result = doc.createElement("img");
        result.setAttribute("src", obj.uri);

        // Set the height, so it appears as a thumbnail.
        result.style.height = "40px";
        return result;
    }

    // Render an individual RDF object to an HTML object displayed
    // in a table cell.
    
    function hints(column) {
        if (options && options.hints && column.variable && options.hints[column.variable.toNT()]) {
            return options.hints[column.variable.toNT()];
        }
        return {};
    }

    function renderValue(obj, column) { // hint

        var cellFormat = hints(column).cellFormat;
        var span;
        if (cellFormat) {
            switch(cellFormat) {
            case 'shortDate':
                return doc.createTextNode(tabulator.panes.utils.shortDate(obj.value));
                break;
                
            default:
                // drop through
            
            }
        } else {
            if (obj.termType == "literal") {
                if (obj.datatype) {
                    if (XSD_DATE_TYPES[obj.datatype.uri]) {
                        return doc.createTextNode(tabulator.panes.utils.shortDate(obj.value));
                    } else if (XSD_NUMBER_TYPES[obj.datatype.uri]) {
                        var span = doc.createElement('span');
                        span.textContent = obj.value;
                        span.setAttribute('style', 'text-align: right');
                        return span;
                    }
                }
                return doc.createTextNode(obj.value);
            } else if (obj.termType == "symbol" && column.isImageColumn()) {
                return renderImage(obj);
            } else if (obj.termType == "symbol" || obj.termType == "bnode") {
                return linkToObject(obj);
            } else if (obj.termType == "collection") {
                var span = doc.createElement('span');
                span.appendChild(doc.createTextNode('['));
                obj.elements.map(function(x){
                    span.appendChild(renderValue(x, column));
                    span.appendChild(doc.createTextNode(', '));
                });
                span.removeChild(span.lastChild);
                span.appendChild(doc.createTextNode(']'));
                return span;
            } else {
                return doc.createTextNode("unknown termtype '"+obj.termType+"'!");
            }
        }
    }

    // Render a row of the HTML table, from the given row structure.
    // Note that unlike other functions, this renders into a provided
    // row (<tr>) element.

    function renderTableRowInto(tr, row, columns) {

        /* Link column, for linking to this subject. */

        var linkTd = doc.createElement("td");

        if (row._subject != null && "uri" in row._subject) {
            linkTd.appendChild(linkTo(row._subject.uri, "\u2192"));
        }

        tr.appendChild(linkTd);

        // Create a <td> for each column (whether the row has data for that
        // column or not).

        for (var i=0; i<columns.length; ++i) {
            var column = columns[i];
            var td = doc.createElement("td");

            var columnKey = column.getKey();

            if (columnKey in row) {
                var objects = row[columnKey];

                for (var j=0; j<objects.length; ++j) {
                    var obj = objects[j];
                    //dump("  column "+i+', object'+j+", obj= "+obj+"\n");

                    td.appendChild(renderValue(obj, column));

                    if (j != objects.length - 1) {
                        td.appendChild(doc.createTextNode(",\n"));
                    }
                }
            }

            tr.appendChild(td);
        }

        // Save a reference to the HTML row in the row object.

        row._htmlRow = tr;

        return tr;
    }

    // Check if a value is already stored in the list of values for
    // a cell (the query can sometimes find it multiple times)

    function valueInList(value, list) {
        var key = null;

        if (value.termType == "literal") {
            key = "value";
        } else if (value.termType == "symbol") {
            key = "uri";
        } else {
            return list.indexOf(value) >= 0;
        }

        // Check the list and compare keys:

        var i;

        for (i=0; i<list.length; ++i) {
            if (list[i].termType == value.termType
             && list[i][key] == value[key]) {
                return true;
            }
        }

        // Not found?

        return false;
    }

    // Update a row, add new values, and regenerate the HTML element
    // containing the values.

    function updateRow(row, columns, values) {

        var key;
        var needUpdate = false;

        for (key in values) {
            var value = values[key];

            // If this key is not already in the row, create a new entry
            // for it:

            if (!(key in row)) {
                row[key] = [];
            }

            // Possibly add this new value to the list, but don't
            // add it if we have already added it:

            if (!valueInList(value, row[key])) {
                row[key].push(value);
                needUpdate = true;
            }
        }

        // Regenerate the HTML row?

        if (needUpdate) {
            clearElement(row._htmlRow);
            renderTableRowInto(row._htmlRow, row, columns);
        }
    }

    // Get a unique ID for the given subject.  This is normally the
    // URI; if the subject has no URI, a unique ID is assigned.

    function getSubjectId(subject) {
        if ("uri" in subject) {
            return subject.uri;
        } else if ("_subject_id" in subject) {
            return subject._subject_id;
        } else {
            var result = "" + subjectIdCounter;
            subject._subject_id = result;
            ++subjectIdCounter;
            return result;
        }
    }

    // Run a query and generate the table.
    // Returns an array of rows.  This will be empty when the function
    // first returns (as the query is performed in the background)

    function runQuery(query, rows, columns, table) {
        var rowsLookup = {};
        query.running = true;
        
        var progressMessage = doc.createElement("tr");
        table.appendChild(progressMessage);
        progressMessage.textContent = "Loading ...";

        
        var onResult = function(values) {

            if (!query.running) {
                return;
            }

            var row = null;
            var rowKey = null;
            var rowKeyId;

            // If the query has a row key, use it to look up the row.

            if (("?" + ROW_KEY_COLUMN) in values) {
                rowKey = values["?" + ROW_KEY_COLUMN];
                rowKeyId = getSubjectId(rowKey);

                // Do we have a row for this already?
                // If so, reuse it; otherwise, we must create a new row.

                if (rowKeyId in rowsLookup) {
                    row = rowsLookup[rowKeyId];
                }
            }

            // Create a new row?

            if (row == null) {
                var tr = doc.createElement("tr");
                table.appendChild(tr);

                row = {
                    _htmlRow: tr,
                    _subject: rowKey
                };
                rows.push(row);

                if (rowKey != null) {
                    rowsLookup[rowKeyId] = row;
                }
            }

            // Add the new values to this row.

            updateRow(row, columns, values);
        };
        
        var onDone = function() {
            progressMessage.parentNode.removeChild(progressMessage);
            applyColumnFilters(rows, columns); // @@ TBL added this
            // Here add table clean-up, remove "loading" message etc.
            if (options.onDone) options.onDone();
        }

        kb.query(query, onResult, undefined, onDone)
    }

    // Given the formula object which is the query pattern,
    // deduce from where the variable occurs constraints on
    // what values it can take.

    function inferColumnsFromFormula(columns, formula) {
        tabulator.log.debug(">> processing formula");

        for (var i=0; i<formula.statements.length; ++i) {
            var statement = formula.statements[i];
            //tabulator.log.debug("processing statement " + i);

            // Does it match this?:
            // <something> <predicate> ?var
            // If so, we can use the predicate as the predicate for the
            // column used for the specified variable.

            if (statement.predicate.termType == "symbol"
             && statement.object.termType == "variable") {
                var variable = statement.object.toString();
                if (variable in columns) {
                    var column = columns[variable];
                    column.setPredicate(statement.predicate, false, statement.subject);
                }
            }
            if (statement.predicate.termType == "symbol"
             && statement.subject.termType == "variable") {
                var variable = statement.subject.toString();
                if (variable in columns) {
                    var column = columns[variable];
                    column.setPredicate(statement.predicate, true, statement.object);
                }
            }
        }

        // Apply to OPTIONAL formulas:

        for (var i=0; i<formula.optional.length; ++i) {
            tabulator.log.debug("recurse to optional subformula " + i);
            inferColumnsFromFormula(columns, formula.optional[i]);
        }

        tabulator.log.debug("<< finished processing formula");
    }

    // Generate a list of column structures and infer details about the
    // predicates based on the contents of the query

    function inferColumns(query) {
        
        // Generate the columns list:

        var result = [];
        var columns = {};

        for (var i=0; i<query.vars.length; ++i) {
            var column = new Column();
            var queryVar = query.vars[i];
            tabulator.log.debug("column " + i + " : " + queryVar);

            column.setVariable(queryVar);
            columns[queryVar] = column;
            result.push(column);
        }

        inferColumnsFromFormula(columns, query.pat);

        return result;
    }

    // Generate a table from a query.

    function renderTableForQuery(query, type) {

        // infer columns from query, to allow generic queries

        if (!givenQuery) {
            columns = type.getColumns();
        } else {
            columns = inferColumns(query);
        }

        // Start with an empty list of rows; this will be populated
        // by the query.

        var rows = [];

        // Create table element and header.

        var table = doc.createElement("table");

        table.appendChild(renderTableHeader(columns, type));
        table.appendChild(renderTableSelectors(rows, columns));

        // Run query.  Note that this is perform asynchronously; the
        // query runs in the background and this call does not block.

        runQuery(query, rows, columns, table);
        
        return table;
    }

    // Find the most common type of row

    function getMostCommonType(types) {
        var bestCount = -1;
        var best = null;

        for (var typeUri in types) {
            var type = types[typeUri];

            if (type.useCount > bestCount) {
                best = type;
                bestCount = type.useCount;
            }
        }

        return best;
    }

    // Filter list of columns to only those columns used in the 
    // specified rows.

    function filterColumns(columns, rows) {
        var filteredColumns = {};

        // Copy columns from "columns" -> "filteredColumns", but only
        // those columns that are used in the list of rows specified.

        for (var columnUri in columns) {
            for (var i=0; i<rows.length; ++i) {
                if (columnUri in rows[i]) {
                    filteredColumns[columnUri] = columns[columnUri];
                    break;
                }
            }
        }

        return filteredColumns;
    }

}
/////////////////////////////////////////////////////////////////////

// ENDS
