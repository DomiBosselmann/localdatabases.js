// Created by Dominique Bosselmann, licensed under CC BY-NC-SA 3.0
// Do not use yet!

Database = function (name,description,maxSize,successHandler,errorHandler) {
	this.stores = [];
	if ("indexedDB" in window || "mozIndexedDB" in window || "webkitIndexedDB" in window) {
		// IndexedDB
		this.technology = "indexedDB";
		indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB;
		
		if ("webkitIDBCursor" in window) {
			IDBCursor = webkitIDBCursor;
			IDBTransaction = webkitIDBTransaction;
			IDBKeyRange = webkitIDBKeyRange;
		}
	} else if ("openDatabase" in window) {
		// WebSQL
		this.technology = "webSQL";
	} else if (typeof google !== "undefined") {
		// Google Gears
		this.technology = "googleGears";
	} else {
		alert("Datenbankverbindung ist in deinem Browser nicht möglich");
		return;
	}
	
	if (name && description) {
		this.open(name,description,maxSize,successHandler,errorHandler);
	}
};

Database.prototype.DBObjectStore = function (parent,name,primaryKey,autoIncrement,indexes,successHandler,errorHandler) {
	this.name = name;
	this.indexes = [];
	this.detailedIndexes = [];
	this.db = parent.db;
	this.technology = parent.technology;
	
	var self = this,
		i = 0;
	
	function getIndexesWebSQL (tx,result) {
		var sqlstring = result.rows.item(0).sql,
			sql = sqlstring.substring(sqlstring.indexOf("(") + 1,sqlstring.indexOf(")")).split(","),
			name, type, parts,
			i = 0;
			
		for (i; i < sql.length; i++) {
			sql[i] = sql[i].indexOf(" ") === 0 ? sql[i].substr(1) : sql[i];
			parts = sql[i].split(" ");
			name = parts[0];
			type = parts[1].toLowerCase();
			
			self.indexes.push(name);
			self.detailedIndexes.push({
				name : name,
				type : type
			});
			
			if (i === 0) {
				self.primaryKey = name;
			}
		}
	}
	
	if (arguments.length > 2) {
		this.create(name,primaryKey,autoIncrement,indexes,successHandler,errorHandler);
		parent.stores[this.name] = this;
	} else {
		if (this.technology === "indexedDB") {
			objectStore = this.db.transaction(name).objectStore(name);
			for (i = 0; i < objectStore.indexNames.length; i++) {
				this.indexes.push(objectStore.indexNames[i]);
			}
		} else if (this.technology === "webSQL") {
			this.db.transaction(function (tx) {
				tx.executeSql("SELECT sql FROM sqlite_master WHERE tbl_name = ? AND type = 'table'",[name],getIndexesWebSQL);
			});
		}
	}
}

Database.prototype.createObjectStore = function (name,primaryKey,autoIncrement,indexes,successHandler,errorHandler,tx) {
	return new this.DBObjectStore(this,name,primaryKey,autoIncrement,indexes,successHandler,errorHandler,tx);
}

Database.prototype.open = function (name,description,maxSize,successHandler,errorHandler) {
	var self = this;
	
	function getTablesFromWebSQL (tx,result) {
		var rows = result.rows,
			storename,
			autoIncrement = false,
			i = 0;
			
		for (i; i < rows.length; i++) {
			storename = rows.item(i).name;
			if (storename === "sqlite_sequence") {
				autoIncrement = true;
			} else {
				self.stores[storename] = new self.DBObjectStore(self,storename);
				if (autoIncrement) {
					self.stores[storename].autoIncrement = true;
				}
			}
		}
		
		if (successHandler) {
			successHandler();
		}
	}
	if (this.technology === "indexedDB") {
		request = indexedDB.open(name,description);
		request.onsuccess = function (event) {
			// Irgendwie noch Asynchron
			self.db = event.result || event.target.result;
			self.version = self.db.version;
			
			storenames = self.db.objectStoreNames;
			
			for (i = 0; i < storenames.length; i++) {
				self.stores[storenames[i]] = new self.DBObjectStore(self,storenames[i]);
			}
			
			if (successHandler) {
				successHandler();
			}
		}
		request.onerror = errorHandler;
	} else if (this.technology === "webSQL") {
		this.db = window.openDatabase(name,"",description,maxSize);
		this.version = this.db.version;
		
		this.db.transaction(function (tx) {
			tx.executeSql("SELECT name FROM sqlite_master WHERE type='table' AND name != '__WebKitDatabaseInfoTable__'",[],getTablesFromWebSQL);
		});
	} else if (this.technology === "googleGears") {
		alert("Diese API-Version unterstützt noch kein Google Gears");
		this.db = google.gears.factory.create("beta.database");
		this.db.open(name);
		this.version = NaN;
	}
};

Database.prototype.close = function () {
	if (this.technology === "indexedDB") {
		this.db.close();
	}
}

Database.prototype.changeVersion = function (versionNumber,handler,errorhandler,successhandler) {
	if (this.technology === "indexedDB") {
		var request = this.db.setVersion(versionNumber);
		request.onsuccess = handler;
		request.onerror = function () { alert("wieso"); };
	} else if (this.technology === "webSQL") {
		this.db.changeVersion(this.db.version,versionNumber,handler,successhandler,errorhandler);
	} else {
		alert("Versionsänderung nicht möglich");
	}
};

Database.prototype.DBObjectStore.prototype.create = function (name,primaryKey,autoIncrement,indexes,successHandler,errorHandler) {
	var obj,
		query, tx;
		
	this.autoIncrement = !!autoIncrement;
	
	if (this.technology === "indexedDB") {
		obj = primaryKey && primaryKey !== "" ? this.db.createObjectStore(name,{ keyPath : primaryKey, autoIncrement : !!autoIncrement }) : this.db.createObjectStore(name,{ autoIncrement : !!autoIncrement });
		for (i = 0; i < indexes.length; i++) {
			if (indexes[i] instanceof Object) {
				obj.createIndex(indexes[i].name,indexes[i].name,{ unique : indexes[i].unique });
				this.indexes.push(indexes[i].name);
			} else {
				obj.createIndex(indexes[i],indexes[i],{ unique : false });
				this.indexes.push(indexes[i]);
			}
		}
		this.primaryKey = primaryKey;
	} else if (this.technology === "webSQL") {
		primaryKey = primaryKey || "id";
		this.primaryKey = primaryKey;
		
		query = !!autoIncrement ? "CREATE TABLE " + name + " (" + primaryKey + " INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL" : "CREATE TABLE " + name + " (" + primaryKey + " TEXT PRIMARY KEY NOT NULL";
		query += indexes.length > 0 ? ", " : "";
		
		for (i = 0; i < indexes.length; i++) {
			if (indexes[i] instanceof Object) {
				this.indexes.push(indexes[i].name);
			} else {
				this.indexes.push(indexes[i]);
			}
		}
		
		query += this.indexes.join(" TEXT, ");
		query += " TEXT)";
	
		this.db.transaction(function (tx) {
			if (successHandler) {
				tx.executeSql(query,[],function (tx,result) { successHandler(result); },errorHandler);
			} else {
				tx.executeSql(query,[]);
			}
		});
	}
};

Database.prototype.remove = function (name) {
	if (this.technology === "indexedDB") {
		if (this.stores[name]) {
			this.db.deleteObjectStore(name);
		}
	} else if (this.technology === "webSQL") {
		this.db.transaction(function (tx) {
			tx.executeSql("DROP TABLE IF EXISTS " + name);
		})
	}
}

Database.prototype.DBObjectStore.prototype.add = function (data,successHandler,errorHandler,completeHandler,useTransaction) {

	var querys = [],
		query, values,
		tx, objectStore, request,
		i = 0,
		self = this;
	
	function addData (data,flag) {
	
		var columns = [], values = [], placeholders = [],
			key = false,
			column, query,
			tx, objectStore, request;
			
	
		if (self.technology === "indexedDB") {
			if (flag !== "prepare") {
				if (data.key && data.value) {
					key = data.key;
					data = data.value;
				}
				
				tx = self.db.transaction(self.name,IDBTransaction.READ_WRITE);
				objectStore = tx.objectStore(self.name);
				
				request = key ? objectStore.add(data,key) : objectStore.add(data);
				request.onsuccess = function (event) {
					var insertedKey = event.result || event.target.result;
					if (successHandler) {
						successHandler(insertedKey);
					}
				}
				request.onerror = errorHandler;
			}
		} else if (self.technology === "webSQL") {
			for (column in data) {
				if (data[column] !== "undefined" && !(data[column] instanceof Function)) {
					columns.push(column);
					values.push(data[column]);
					placeholders.push("?");
				}
			}
			
			query = "INSERT INTO " + self.name + " (" + columns.join(",") + ") VALUES (" + placeholders.join(",") + ")";
			if (flag !== "prepare") {
				// Nutzt keine totale Transaktion, wird daher direkt ausgeführt.
				if (flag === true) {
					self.db.transaction(function (tx) {
						if (successHandler) {
							tx.executeSql(query,values,function (tx,result) { successHandler(result.insertId); if (completeHandler) { completeHandler(); } },errorHandler);
						} else {
							successHandler = completeHandler;
							tx.executeSql(query,values,successHandler,errorHandler);
						}
					});
				} else {
					self.db.transaction(function (tx) {
						if (successHandler) {
							tx.executeSql(query,values,function (tx,result) { successHandler(result.insertId); },errorHandler);
						} else {
							tx.executeSql(query,values,successHandler,errorHandler);
						}
					});
				}
			} else {
				return [query,values];
			}
		}
		
		return data;
	}
	
	if (useTransaction === false) {
		// benutzt für jede Abfrage eine einzelne Transaktion
		if (data instanceof Array) {
			for (i; i < data.length; i++) {
				addData(data[i], i === data.length - 1);
			}
		} else {
			addData(data);
		}
	} else {
		// eine globale Transaktion (default)
		if (data instanceof Array) {
			if (this.technology !== "indexedDB") {
				for (i; i < data.length; i++) {
					querys.push(addData(data[i], "prepare"));
				}
				
				if (this.technology === "webSQL") {
					this.db.transaction(function (tx) {
						for (i = 0; i < querys.length; i++) {
							query = querys[i][0];
							values = querys[i][1];
							
							if (i === querys.length - 1 && completeHandler) {
								if (successHandler) {
									tx.executeSql(query,values,function (tx,result) { 
										successHandler(result.insertId); completeHandler(); 
									},errorHandler);
								} else {
									successHandler = completeHandler;
									tx.executeSql(query,values,successHandler,errorHandler);
								}
							} else {
								if (successHandler) {
									tx.executeSql(query,values,function (tx,result) { 
										successHandler(result.insertId); 
									},errorHandler);
								} else {
									tx.executeSql(query,values,successHandler,errorHandler);
								}
							}
						}
					});
				}
			} else {
				tx = this.db.transaction(this.name,IDBTransaction.READ_WRITE);
				objectStore = tx.objectStore(this.name);
				
				tx.oncomplete = completeHandler;
				
				for (i; i < data.length; i++) {
					if (data[i].key !== "undefined" && data[i].value) {
						key = data[i].key;
						tempData = data[i].value;
						request = objectStore.add(tempData,key);
					} else {
						request = objectStore.add(data[i]);
					}
					request.onsuccess = function (event) {
						var insertedKey = event.result || event.target.result;
						if (successHandler) {
							successHandler(insertedKey);
						}
					}
					request.onerror = errorHandler;
				}
			}
		} else {
			addData(data);
		}
	}
};

Database.prototype.DBObjectStore.prototype.update = function (key,type,data,successHandler,errorHandler) {
	var queryParts = [], values = [];
	if (this.technology === "indexedDB") {
		tx = this.db.transaction(this.name,IDBTransaction.READ_WRITE);
		obj = tx.objectStore(this.name);
		
		if (type === "update") {
			request = obj.get(key);
			request.onsuccess = function (event) {
				var value = event.target.result;
				
				for (column in data) {
					if (data.hasOwnProperty(column)) {
						value[column] = data[column];
					}
				}
				
				request = obj.put(value);
				
				request.onsuccess = function (event) {
					if (successHandler) {
						successHandler(key);
					}
				}
			}
		} else {
			request = obj.put(data);
			if (successHandler) {
				request.onsuccess = function () {
					successHandler(key);
				}
			}
			request.onerror = errorHandler;
		}
	} else if (this.technology === "webSQL") {
		for (column in data) {
			if (data.hasOwnProperty(column)) {
				queryParts.push(column + " = ?");
				values.push(data[column]);
			}
		}
		
		values.push(key);
		
		query = "UPDATE " + this.name + " SET " + queryParts.join(", ") + " WHERE " + this.primaryKey + " = ?";
		this.db.transaction(function (tx) {
			tx.executeSql(query,values,function (tx,result) {
				if (successHandler) {
					successHandler(key);
				}
			},errorHandler);
		});
	}
}

Database.prototype.DBObjectStore.prototype.get = function (columns,options,successHandler,errorHandler) {
	var filters = [], group, order = [], ascending = true, limit = false,
		data = [],
		conditions = "",
		i = 0,
		self = this;
	
	if (options instanceof Object) {
		filters = options.filters instanceof Array && options.filters[0].length === options.filters[1].length + 1 ? options.filters : [];
		group = options.group ? options.group : group;
		order = options.order ? options.order : order;
		ascending = options.ascending ? options.ascending : ascending;
		limit = options.limit ? options.limit : limit;
	}
	
	ascending = ascending ? "ASC" : "DESC";
	
	if (this.technology === "indexedDB") {
		tx = this.db.transaction(this.name);
		objectStore = tx.objectStore(this.name);
				
		if (filters.length !== 0 && filters[0].length > 0) {
			this.IDBComplexQueriesHelper.initFilter(filters[0],objectStore);
			tx.oncomplete = function () {
				data = self.IDBComplexQueriesHelper.applyFilter(filters[1]);
				data = group ? self.IDBComplexQueriesHelper.group(data,group) : data;
				data = order.length !== 0 ? self.IDBComplexQueriesHelper.orderBy(data,order,ascending) : data;
				data = limit ? self.IDBComplexQueriesHelper.limit(data,limit[0],limit[1]) : data;
					
					self.createResultsFromIndexedDB(data,successHandler);
			}
		} else {
			objectStore.openCursor().onsuccess = function (event) {
				cursor = event.target.result;
				if (cursor) {
					data.push(cursor.value);
					cursor["continue"]();
				} else {
					data = group ? self.IDBComplexQueriesHelper.group(data,group) : data;
					data = order.length !== 0 ? self.IDBComplexQueriesHelper.orderBy(data,order,ascending) : data;
					data = limit ? self.IDBComplexQueriesHelper.limit(data,limit[0],limit[1]) : data;
					
					self.createResultsFromIndexedDB(data,successHandler);
				}
			}
		}
	} else if (this.technology === "webSQL") {
		if (filters.length !== 0 && filters[0].length > 0) {
			for (i; i < filters[0].length; i++) {
				switch (filters[0][i].type) {
					case "equal" : conditions += filters[0][i].column + " = '" + filters[0][i].value + "'"; break;
					case "between" : conditions += filters[0][i].column + " BETWEEN '" + filters[0][i].value[0] + "' AND '" + filters[0][i].value[1] + "'"; break;
					case "is not" : conditions += filters[0][i].column + " != '" + filters[0][i].value + "'"; break;
					case "greater" : conditions += filters[0][i].column + " > '" + filters[0][i].value + "'"; break;
					case "smaller" : conditions += filters[0][i].column + " < '" + filters[0][i].value + "'"; break;
					case "like" : conditions += filters[0][i].column + " LIKE '" + filters[0][i].value + "'"; break;
					case 0 : conditions += filters[0][i].column + " = '" + filters[0][i].value + "'"; break;
					case 1 : conditions += filters[0][i].column + " BETWEEN '" + filters[0][i].value[0] + "' AND '" + filters[0][i].value[1] + "'"; break;
					case 2 : conditions += filters[0][i].column + " != '" + filters[0][i].value + "'"; break;
					case 3 : conditions += filters[0][i].column + " > '" + filters[0][i].value + "'"; break;
					case 4 : conditions += filters[0][i].column + " < '" + filters[0][i].value + "'"; break;
					case 5 : conditions += filters[0][i].column + " LIKE '" + filters[0][i].value + "'"; break;
				}
				
				if (filters[1][i]) {
					conditions += " " + filters[1][i] + " ";
				}
			}
			
			query = "SELECT " + columns.join(",") + " FROM " + this.name + " WHERE " + conditions;
			query = group ? query + " GROUP BY " + group : query;
			query = order.length !== 0 ? query + " ORDER BY " + order.join(",") + ascending : query;
			query = limit ? query + " LIMIT " + limit[0] + "," + limit[1] : query;
		} else {
			query = "SELECT " + columns.join(",") + " FROM " + this.name;
			query = group ? query + " GROUP BY " + group : query;
			query = order.length !== 0 ? query + " ORDER BY " + order.join(",") + ascending : query;
			query = limit ? query + " LIMIT " + limit[0] + "," + limit[1] : query;
		}
		
		
		
		this.db.transaction(function (tx) {
			tx.executeSql(query,[],function (tx,result) { self.createResultsFromWebSQL(tx,result,successHandler); },errorHandler);
		});
	}
}

Database.prototype.DBObjectStore.prototype.createResultsFromWebSQL = function (tx,result,successHandler) {
	var newResult = {
		rows : [],
		length : result.rows.length
	};
	
	for (var i = 0; i < result.rows.length; i++) {
		newResult.rows.push(result.rows.item(i));
	}
	
	successHandler(newResult);
}

Database.prototype.DBObjectStore.prototype.createResultsFromIndexedDB = function (result,successHandler) {
	var newResult = {
		rows : result,
		length : result.length
	}
	
	
	successHandler(newResult);
}

Database.prototype.DBObjectStore.prototype.IDBComplexQueriesHelper = {
	tempResults : [],
	orderBy : function (result,columns,direction) {
		// Aktuell nur alphabetische Reihenfolge, sowie nur eine Spalte
		if (!result) {
			return;
		}
		
		var newArray = [],
			startcolumn,
			i = 0;
		
		if (!direction) {
			direction = "ASC";
		}
		
		if (columns instanceof Array) {
			startcolumn = columns[0];
		} else {
			startcolumn = columns;
		}
		
		for (i; i < result.length; i++) {
			newArray.push([result[i][startcolumn],result[i]]);
		}
	
		newArray = result.sort(function (a,b) {
			var left = a[startcolumn],
				right = b[startcolumn],
				j = 1;
			
			while (left === right && columns[j]) {
				left = a[columns[j]];
				right = b[columns[j]];
			}
			
			if (left > right) {
				return -1;
			}
			
			if (right > left) {
				return 1;
			}
			
			return 0;
		});
		newArray = direction === "DESC" ? newArray.reverse() : newArray;
				
		return newArray;
	},
	
	initFilter : function (filters,objectStore) {
		this.tempResults = [];
		var index, keyRange, openCursor,
			i = 0, length = filters.length,
			self = this;
		
		for (i; i < length; i++) {
			index = objectStore.index(filters[i].column);
			switch (filters[i].type) {
				case "equal" : keyRange = IDBKeyRange.only(filters[i].value); break;
				case "between" : keyRange = IDBKeyRange.bound(filters[i].value[0],filters[i].value[1]);  break;
				case "greater" : keyRange = IDBKeyRange.leftBound(filters[i].value); break;
				case "smaller" : keyRange = IDBKeyRange.rightBound(filters[i].value);  break;
				case 0 : keyRange = IDBKeyRange.only(filters[i].value); break;
				case 1 : keyRange = IDBKeyRange.bound(filters[i].value[0],filters[i].value[1]);  break;
				case 3 : keyRange = IDBKeyRange.leftBound(filters[i].value); break;
				case 4 : keyRange = IDBKeyRange.rightBound(filters[i].value);  break;
			}
			
			openCursor = keyRange ? index.openCursor(keyRange) : index.openCursor();
			keyRange = filters[i].type;
			
			if (!(this.tempResults[i] instanceof Array)) {
				this.tempResults[i] = [];
			}
											
			openCursor.onsuccess = (function (i) {
				return function (event) {
					var cursor = event.target.result;
					
					if (cursor) {
						self.tempResults[i].push(cursor.value);
						cursor["continue"]();
					} else {
						if (keyRange === "is not" || keyRange === 2) {
							self.tempResults[i] = self.isnot(self.tempResults[i],filters[i].value,filters[i].column);
						} else if (keyRange === "like" || keyRange === 5) {
							self.tempResults[i] = self.like(self.tempResults[i],filters[i].value,filters[i].column);
						}
					}
				};
			})(i);
		}
		
		return;
	},
	
	applyFilter : function (concats) {
		while (this.tempResults.length !== 1) {
			if (concats[0] === "AND") {
				var newArray = this.tempResults[0].merge(this.tempResults[1]);
			} else {
				var newArray = this.tempResults[0].unify(this.tempResults[1]);
			}
			
			this.tempResults.splice(0,2,newArray);
			concats.splice(0,1);
		}
		
		return this.tempResults[0];
	},
	
	limit : function (result,min,max) {
		var newResult = [],
			i = 0;
		
		for (i; i < result.length; i++) {
			if (result[i] > min && result[i] < max) {
				newResult.push(result[i]);
			}
		}
		
		return newResult;
	},
	
	group : function (result,column) {
		var newResult = [],
			uniqueValues = [],
			i = 0;
			
		for (i; i < result.length; i++) {
			if (!uniqueValues.in_array(result[i][column])) {
				uniqueValues.push(result[i][column]);
				newResult.push(result[i]);
			}
		}
		
		return newResult;
	},
	
	isnot : function (result,pattern,column) {
		var newResult = [],
			i = 0;
		
		for (i; i < result.length; i++) {
			if (result[i][column].indexOf(pattern) === -1) {
				newResult.push(result[i]);
			}
		}
		
		return newResult;
	},
	
	like : function (result,pattern,column) {
		var newResult = [],
			i = 0;
			
		if (pattern.indexOf("%") !== 0) {
			pattern = "^" + pattern;
		}
		
		if (pattern.lastIndexOf("%") !== pattern.length - 1) {
			pattern += "$";
		}
		
		pattern = pattern.replace(/%/gi,"");
		
		pattern = new RegExp(pattern,"gi");
			
		for (i; i < result.length; i++) {
			if (result[i][column].search(pattern) !== -1) {
				newResult.push(result[i]);
			}
		}
		
		return newResult;
	}
}

Database.prototype.DBObjectStore.prototype.remove = function (key,successHandler,errorHandler) {
	var self = this;
	
	if (this.technology === "indexedDB") {
		tx = this.db.transaction(this.name,IDBTransaction.READ_WRITE);
		obj = tx.objectStore(this.name);
		request = obj["delete"](key);
		request.onsuccess = successHandler;
		request.onerror = errorHandler;
	} else if (this.technology === "webSQL") {
		this.db.transaction(function (tx) {
			tx.executeSql("DELETE FROM " + self.name + " WHERE " + self.primaryKey + " = ?",[key],successHandler,errorHandler);
		});
	}
}

Database.prototype.DBObjectStore.prototype.clear = function (successHandler,errorHandler) {
	var keys = [],
		self = this;
	
	if (this.technology === "indexedDB") {
		tx = this.db.transaction(this.name,IDBTransaction.READ_WRITE);
		objectStore = tx.objectStore(this.name);
		
		request = objectStore.clear();
		request.onsuccess = successHandler;
		request.onerror = errorHandler;
	} else if (this.technology === "webSQL") {
		this.db.transaction(function (tx) {
			if (self.autoIncrement) {
				tx.executeSql("DELETE FROM " + self.name,[],function (tx) { tx.executeSql("DELETE FROM sqlite_sequence WHERE name = ?",[self.name],successHandler,errorHandler); },errorHandler);
			} else {
				tx.executeSql("DELETE FROM " + self.name,[],successHandler,errorHandler);
			}
		});
	}
}
