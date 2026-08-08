/**
 * STORAGE ENGINE & GOOGLE APPS SCRIPT (GAS) BRIDGE
 * Zero-Server Cost Infrastructure Controller
 */

class StorageEngine {
  constructor() {
    this.drivePath = "Z:\\My Drive\\BQL_PROJECT_MASTER";
    this.loadState();
  }

  loadState() {
    const localDirectives = localStorage.getItem("bql_directives");
    if (localDirectives) {
      try { MASTER_DATA.directives = JSON.parse(localDirectives); } catch(e){}
    }

    const localHandovers = localStorage.getItem("bql_handovers");
    if (localHandovers) {
      try { MASTER_DATA.handoverPlans = JSON.parse(localHandovers); } catch(e){}
    }

    const localNotes = localStorage.getItem("bql_sticky_notes");
    if (localNotes) {
      try { MASTER_DATA.stickyNotes = JSON.parse(localNotes); } catch(e){}
    }
  }

  saveDirectives() {
    localStorage.setItem("bql_directives", JSON.stringify(MASTER_DATA.directives));
  }

  saveHandovers() {
    localStorage.setItem("bql_handovers", JSON.stringify(MASTER_DATA.handoverPlans));
  }

  saveNotes() {
    localStorage.setItem("bql_sticky_notes", JSON.stringify(MASTER_DATA.stickyNotes));
  }

  // Generate Google Apps Script code for zero-cost deployment to Google Workspace
  generateGASScript() {
    return `/**
 * GOOGLE APPS SCRIPT (GAS) BACKEND MASTER CODE FOR BQLDA SUPER APP
 * Copy and paste this code into Extensions -> Apps Script on Google Sheets / Google Drive
 */

function doGet(e) {
  var action = e.parameter.action;
  if (action === "getDirectives") {
    return ContentService.createTextOutput(JSON.stringify(getDirectivesFromSheet()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (action === "getSpaces") {
    return ContentService.createTextOutput(JSON.stringify(getSpacesFromSheet()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput("BQLDA Google Apps Script API Server Running Cleanly!");
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  if (data.action === "addHandoverReport") {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("HandoverReports");
    sheet.appendRow([new Date(), data.spaceId, data.status, data.note, data.inspector]);
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Đã lưu báo cáo thành công!" }));
  }
  return ContentService.createTextOutput(JSON.stringify({ status: "error" }));
}

function getDirectivesFromSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("GiaoBan");
  var values = sheet.getDataRange().getValues();
  return values;
}
`;
  }
}

window.storageEngine = new StorageEngine();
