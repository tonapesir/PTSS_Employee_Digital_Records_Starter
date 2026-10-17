/**
 * PTSS Employee Digital Records - Google Apps Script backend
 * Deploy as Web App. Configure Script Properties:
 *   ROOT_FOLDER_ID = Drive folder ID for the institution's private root folder
 *   ALLOWED_DOMAIN = optional Google Workspace domain, e.g. example.org (leave blank to rely on Users tab)
 *
 * Important: use an institution-controlled Google Workspace account where possible.
 * Never make the Drive root or employee folders public.
 */

const SHEETS = {
  schools: 'Schools',
  employees: 'Employees',
  types: 'DocumentTypes',
  users: 'Users',
  log: 'UploadLog',
  settings: 'Settings'
};

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('कर्मचारी डिजिटल अभिलेख | पाचोरा तालुका सहकारी शिक्षण संस्था')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getInitialData() {
  const email = getCurrentEmail_();
  const user = authorizeUser_(email);
  const schools = readRows_(SHEETS.schools).filter(r => truthy_(r.Active));
  const employees = readRows_(SHEETS.employees).filter(r => truthy_(r.Active));
  const types = readRows_(SHEETS.types).filter(r => truthy_(r.Active));
  const permittedSchools = user.Role === 'ADMIN'
    ? schools
    : schools.filter(s => String(s.School_ID) === String(user.School_ID));

  const permittedSchoolIds = new Set(permittedSchools.map(s => String(s.School_ID)));
  return {
    email,
    role: user.Role,
    schools: permittedSchools.map(s => ({id:String(s.School_ID), name:String(s.School_Name)})),
    employees: employees
      .filter(e => permittedSchoolIds.has(String(e.School_ID)) || user.Role === 'ADMIN')
      .map(e => ({
        id:String(e.Shalarth_ID),
        name:String(e.Employee_Name),
        schoolId:String(e.School_ID),
        designation:String(e.Designation || '')
      })),
    documentTypes: types
      .sort((a,b) => Number(a.Sort_Order || 999) - Number(b.Sort_Order || 999))
      .map(t => ({id:String(t.Doc_ID), name:String(t.Document_Name), category:String(t.Category || '')}))
  };
}

function uploadPdf(payload) {
  // payload: {schoolId, shalarthId, docId, fileName, mimeType, base64, sizeBytes}
  const email = getCurrentEmail_();
  const user = authorizeUser_(email);
  validateUpload_(payload, user);

  const maxBytes = 10 * 1024 * 1024; // keep Apps Script request payloads modest; split large PDFs.
  if (!payload.sizeBytes || Number(payload.sizeBytes) > maxBytes) {
    throw new Error('PDF 10 MB पेक्षा मोठी आहे. कृपया PDF कमी आकारात/भागांमध्ये तयार करा आणि पुन्हा अपलोड करा.');
  }
  if (!payload.base64 || !/^application\/pdf$/i.test(payload.mimeType || '')) {
    throw new Error('फक्त PDF फाइल अपलोड करता येईल.');
  }

  const bytes = Utilities.base64Decode(payload.base64);
  if (!bytes.length || bytes.length > maxBytes) throw new Error('PDF आकार तपासता आला नाही किंवा मर्यादेपेक्षा मोठा आहे.');
  // Check PDF signature.
  const signature = Utilities.newBlob(bytes).getDataAsString().slice(0, 4);
  if (signature !== '%PDF') throw new Error('ही वैध PDF फाइल दिसत नाही.');

  const employee = findBy_(SHEETS.employees, 'Shalarth_ID', payload.shalarthId);
  const school = findBy_(SHEETS.schools, 'School_ID', payload.schoolId);
  const docType = findBy_(SHEETS.types, 'Doc_ID', payload.docId);
  const root = getRootFolder_();
  const schoolFolder = getOrCreateFolder_(root, safeName_(school.School_Name) + '_' + safeName_(school.School_ID));
  const employeeFolder = getOrCreateFolder_(schoolFolder, safeName_(employee.Shalarth_ID) + '_' + safeName_(employee.Employee_Name));
  const typeFolder = getOrCreateFolder_(employeeFolder, safeName_(docType.Document_Name));

  const date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmmss');
  const finalName = safeName_(employee.Shalarth_ID) + '_' + safeName_(docType.Document_Name) + '_' + date + '.pdf';
  const blob = Utilities.newBlob(bytes, 'application/pdf', finalName);
  const file = typeFolder.createFile(blob);
  file.setDescription('PTSS कर्मचारी अभिलेख | Shalarth ID: ' + employee.Shalarth_ID +
    ' | Document type: ' + docType.Document_Name + ' | Uploaded by: ' + email);

  appendLog_([
    Utilities.getUuid(), new Date(), employee.Shalarth_ID, school.School_ID,
    docType.Doc_ID, finalName, file.getId(), email, 'SUCCESS', file.getSize()
  ]);

  return {ok:true, fileName:finalName, driveFileId:file.getId(), message:'PDF Google Drive मध्ये अपलोड झाली.'};
}

function getDocumentTypesForAdmin() {
  const user = authorizeUser_(getCurrentEmail_());
  if (user.Role !== 'ADMIN') throw new Error('ही सुविधा फक्त ADMIN साठी आहे.');
  return readRows_(SHEETS.types);
}

function saveDocumentType(record) {
  const user = authorizeUser_(getCurrentEmail_());
  if (user.Role !== 'ADMIN') throw new Error('ही सुविधा फक्त ADMIN साठी आहे.');
  const name = String(record.documentName || '').trim();
  const category = String(record.category || '').trim();
  if (!name) throw new Error('कागदपत्राचा प्रकार लिहा.');
  const sh = getSheet_(SHEETS.types);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0].map(String);
  const idCol = headers.indexOf('Doc_ID');
  const nameCol = headers.indexOf('Document_Name');
  const activeCol = headers.indexOf('Active');
  const catCol = headers.indexOf('Category');
  const orderCol = headers.indexOf('Sort_Order');
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][nameCol]).trim().toLowerCase() === name.toLowerCase()) {
      sh.getRange(i+1, activeCol+1).setValue(true);
      sh.getRange(i+1, catCol+1).setValue(category);
      return {ok:true, message:'हा प्रकार आधीपासून होता; पुन्हा सक्रिय केला.'};
    }
  }
  const nextOrder = Math.max(0, ...rows.slice(1).map(r => Number(r[orderCol] || 0))) + 1;
  sh.appendRow([ 'DOC-' + Utilities.getUuid().slice(0,8).toUpperCase(), name, category, true, nextOrder ]);
  return {ok:true, message:'नवीन कागदपत्र प्रकार जोडला.'};
}

function setDocumentTypeActive(docId, active) {
  const user = authorizeUser_(getCurrentEmail_());
  if (user.Role !== 'ADMIN') throw new Error('ही सुविधा फक्त ADMIN साठी आहे.');
  const sh = getSheet_(SHEETS.types);
  const rows = sh.getDataRange().getValues();
  const headers = rows[0].map(String);
  const idCol = headers.indexOf('Doc_ID');
  const activeCol = headers.indexOf('Active');
  for (let i=1; i<rows.length; i++) {
    if (String(rows[i][idCol]) === String(docId)) {
      sh.getRange(i+1, activeCol+1).setValue(Boolean(active));
      return {ok:true, message: active ? 'प्रकार सक्रिय केला.' : 'प्रकार निष्क्रिय केला.'};
    }
  }
  throw new Error('कागदपत्र प्रकार सापडला नाही.');
}

function validateUpload_(p, user) {
  if (!p || !p.schoolId || !p.shalarthId || !p.docId || !p.fileName) throw new Error('शाळा, कर्मचारी, कागदपत्र प्रकार आणि PDF निवडा.');
  const employee = findBy_(SHEETS.employees, 'Shalarth_ID', p.shalarthId);
  if (!employee || !truthy_(employee.Active)) throw new Error('सक्रिय कर्मचारी नोंद सापडली नाही.');
  if (String(employee.School_ID) !== String(p.schoolId)) throw new Error('निवडलेली शाळा आणि कर्मचारी जुळत नाहीत.');
  if (user.Role !== 'ADMIN' && String(user.School_ID) !== String(p.schoolId)) throw new Error('या शाळेसाठी अपलोड करण्याची परवानगी नाही.');
  const school = findBy_(SHEETS.schools, 'School_ID', p.schoolId);
  if (!school || !truthy_(school.Active)) throw new Error('सक्रिय शाळा नोंद सापडली नाही.');
  const type = findBy_(SHEETS.types, 'Doc_ID', p.docId);
  if (!type || !truthy_(type.Active)) throw new Error('सक्रिय कागदपत्र प्रकार निवडा.');
}

function getCurrentEmail_() {
  return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
}

function authorizeUser_(email) {
  if (!email) throw new Error('Google खात्याची ईमेल ओळख मिळाली नाही. संस्था Google Workspace खात्यातून लॉगिन करा आणि Web App access तपासा.');
  const user = readRows_(SHEETS.users).find(r =>
    String(r.Email || '').trim().toLowerCase() === email &&
    truthy_(r.Active));
  if (!user) throw new Error('या ईमेलला प्रणाली वापरण्याची परवानगी नाही: ' + email);
  return {Email:email, Role:String(user.Role || 'STAFF').toUpperCase(), School_ID:String(user.School_ID || '')};
}

function getRootFolder_() {
  const id = PropertiesService.getScriptProperties().getProperty('ROOT_FOLDER_ID');
  if (!id) throw new Error('Apps Script → Project Settings → Script Properties मध्ये ROOT_FOLDER_ID सेट करा.');
  return DriveApp.getFolderById(id);
}

function getSheet_(name) {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Script Properties मध्ये SPREADSHEET_ID सेट करा.');
  const ss = SpreadsheetApp.openById(id);
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Google Sheet tab सापडला नाही: ' + name);
  return sh;
}

function readRows_(name) {
  const sh = getSheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(row => row.some(v => v !== '')).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function findBy_(sheetName, key, value) {
  return readRows_(sheetName).find(r => String(r[key]) === String(value)) || null;
}

function getOrCreateFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function safeName_(value) {
  return String(value || '').replace(/[\\/:*?"<>|#%{}~&]/g, '_').replace(/\s+/g, '_').slice(0, 100) || 'NA';
}

function truthy_(value) {
  return value === true || String(value).toLowerCase() === 'true' || String(value) === '1' || String(value).toLowerCase() === 'yes';
}

function appendLog_(row) {
  getSheet_(SHEETS.log).appendRow(row);
}
