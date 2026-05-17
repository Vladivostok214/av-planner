/**
 * AV CONTENT PLANNER - SOVEREIGN BACKEND API (Google Apps Script)
 * 
 * Este código debe ser pegado en el editor de Apps Script vinculado al Google Sheet.
 * Gestiona la sincronización bidireccional, permitiendo guardar, actualizar y borrar proyectos
 * de forma dinámica basándose en los encabezados de las columnas.
 * 
 * Fecha de actualización: Mayo 2026
 */

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var jsonArray = [];
  
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      // Normaliza los encabezados a minúsculas para el JSON de salida
      obj[headers[j].toLowerCase()] = data[i][j];
    }
    jsonArray.push(obj);
  }
  
  return ContentService.createTextOutput(JSON.stringify(jsonArray))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000); // Previene colisiones de escritura simultánea
  
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    var id = payload.id;
    
    var rows = sheet.getDataRange().getValues();
    var headers = rows[0];
    
    if (action === 'save') {
      // CREAR NUEVO PROYECTO
      // Crea una fila vacía del tamaño de los encabezados actuales
      var newRow = new Array(headers.length).fill("");
      for (var key in payload) {
        var colIdx = findColumn(headers, key);
        if (colIdx !== -1) newRow[colIdx] = payload[key];
      }
      sheet.appendRow(newRow);
      return response("Success: Project Saved");
      
    } else if (action === 'update') {
      // ACTUALIZAR PROYECTO EXISTENTE
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] == id) { // Busca por ID único (Columna A)
          var rowNum = i + 1;
          for (var key in payload) {
            var colIdx = findColumn(headers, key);
            // Evita escribir la propiedad 'action' en el Excel
            if (colIdx !== -1 && key !== 'action') {
              sheet.getRange(rowNum, colIdx + 1).setValue(payload[key]);
            }
          }
          return response("Success: Project Updated");
        }
      }
      return response("Error: ID not found");

    } else if (action === 'delete') {
      // BORRAR PROYECTO
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] == id) {
          sheet.deleteRow(i + 1);
          return response("Success: Project Deleted");
        }
      }
      return response("Error: ID not found for deletion");
    }
    
  } catch (error) {
    return response("Error: " + error.toString());
  } finally {
    lock.releaseLock();
  }
}

/**
 * Busca el índice de una columna basándose en el nombre (ignorando mayúsculas/minúsculas).
 */
function findColumn(headers, key) {
  var k = key.toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].toString().toLowerCase() === k) return i;
  }
  return -1;
}

function response(msg) {
  return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
}
