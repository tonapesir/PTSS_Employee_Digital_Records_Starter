# पाचोरा तालुका सहकारी शिक्षण संस्था — कर्मचारी डिजिटल अभिलेख प्रणाली

## या पॅकेजमध्ये काय आहे?
- `Index.html` — मराठी वेब UI: शाळा, कर्मचारी, Shalarth ID, कागदपत्र प्रकार, स्कॅन, PDF निवड आणि अपलोड.
- `Code.gs` — Google Apps Script backend, Drive folder creation, permissions आणि UploadLog.
- `Google_Sheets_Schema.csv` — आवश्यक Google Sheets tabs व columns.
- `ScannerBridge.py` — Windows वर NAPS2 वापरून स्कॅन करणारा स्थानिक prototype.
- `Start_Scanner_Bridge.bat` — scanner bridge सुरू करण्यासाठी.

## महत्त्वाची मर्यादा / compatibility
सामान्य HTML थेट प्रत्येक स्कॅनर नियंत्रित करू शकत नाही. या prototype मध्ये NAPS2 CLI हा scanner-driver bridge आहे. त्यामुळे स्कॅनरला Windows WIA/TWAIN/ESCL आणि NAPS2 समर्थन आवश्यक आहे. अंतिम deployment आधी प्रत्यक्ष स्कॅनरवर pilot चाचणी आवश्यक आहे. Chrome मधून HTTPS Apps Script पेजने localhost HTTP सेवा कॉल करताना ब्राउझर आवृत्ती/Local Network Access परवानग्यांमुळे अडथळा येऊ शकतो. अडथळा आल्यास browser extension किंवा signed desktop bridge हा पुढील टप्पा असेल.

## 1. Google Drive व Google Sheet तयार करा
1. संस्थेच्या नियंत्रणातील Google खाते वापरा; वैयक्तिक कर्मचाऱ्याच्या Drive वर अवलंबून राहू नका.
2. Google Drive मध्ये खासगी folder तयार करा: `PTSS_Employee_Digital_Records`.
3. त्या folder चा ID URL मधून घ्या.
4. नवीन Google Spreadsheet तयार करा. त्यात खालील tabs अचूक नावाने तयार करा:
   - `Schools`: `School_ID | School_Name | Active`
   - `Employees`: `Shalarth_ID | Employee_Name | School_ID | Designation | Active`
   - `DocumentTypes`: `Doc_ID | Document_Name | Category | Active | Sort_Order`
   - `Users`: `Email | Role | School_ID | Active`
   - `UploadLog`: `Upload_ID | Date_Time | Shalarth_ID | School_ID | Doc_ID | File_Name | Drive_File_ID | Uploaded_By | Status | Size_Bytes`
   - `Settings`: `Setting_Key | Setting_Value`
5. CSV schema मध्ये दिलेल्या header नावांची spelling जशीच्या तशी ठेवा. `Active` मध्ये TRUE/FALSE वापरा.
6. `Users` मध्ये परवानगी असलेले Google ईमेल भरा. `ADMIN` ला सर्व शाळा; `STAFF` ला फक्त त्याच्या `School_ID` ची परवानगी.

## 2. Apps Script तयार करा
1. Spreadsheet उघडा → Extensions → Apps Script.
2. default `Code.gs` मध्ये या पॅकेजमधील `Code.gs` पेस्ट करा.
3. `+` → HTML file तयार करा; नाव `Index` ठेवा; `Index.html` मधील सामग्री पेस्ट करा.
4. Project Settings → Script Properties मध्ये:
   - `SPREADSHEET_ID` = Spreadsheet URL मधील ID
   - `ROOT_FOLDER_ID` = खासगी Drive root folder ID
5. Save करा. `getInitialData` तपासण्यासाठी deploy करावे लागेल.

## 3. Web App deploy
1. Deploy → New deployment → type `Web app`.
2. `Execute as`: शक्यतो **User accessing the web app** निवडा, म्हणजे वापरकर्त्याच्या Drive permissions लागू होतील. संस्थेच्या Google Workspace सेटअपनुसार पर्याय बदलू शकतो.
3. `Who has access`: संस्थेतील आवश्यक वापरकर्त्यांपुरतेच मर्यादित ठेवा. Public/Anyone access निवडू नका.
4. Deploy करून authorization prompts पूर्ण करा.
5. पहिली चाचणी ADMIN वापरकर्त्याने करा. `Session.getActiveUser().getEmail()` काही वैयक्तिक Google खाते किंवा विशिष्ट deployment मध्ये रिकामे मिळू शकते; अशा वेळी संस्थेच्या Workspace domain deployment चे नियोजन करावे.

## 4. Windows scanner bridge
1. NAPS2 अधिकृत साइटवरून install करा: https://www.naps2.com/
2. NAPS2 GUI उघडा; scanner निवडा; profile तयार करा. Profile name अचूक नोंदवा.
3. `Start_Scanner_Bridge.bat` चालवण्यापूर्वी Windows Environment Variables मध्ये:
   - `NAPS2_PROFILE` = NAPS2 मधील profile चे अचूक नाव
   - गरज असल्यास `NAPS2_PATH` = `NAPS2.Console.exe` चा पूर्ण path
4. BAT चालवा. `/health` तपासण्यासाठी browser मध्ये `http://127.0.0.1:8765/health` उघडा.
5. मग Apps Script web app उघडून शाळा/कर्मचारी/प्रकार निवडा आणि स्कॅन करा.

## 5. सुरक्षित pilot चाचणी
- आधी बनावट/चाचणी नोंदी वापरा; वास्तविक संवेदनशील कर्मचारी कागदपत्रे वापरण्यापूर्वी access permissions तपासा.
- एका flatbed scanner वर एक पान; नंतर ADF scanner वर 5–10 पाने; मग duplex, blank-page आणि मोठ्या PDF चाचण्या करा.
- या आवृत्तीत Apps Script upload साठी 10 MB मर्यादा ठेवली आहे. मोठी PDF लहान भागांत स्कॅन/विभाजित करा.
- Google Drive फाइल सार्वजनिक करू नका. संस्थेतील भूमिका, audit log, नियमित backup आणि retention policy निश्चित करा.
- वेब पेजच्या स्कॅन बटणाने लोकल Downloads मध्ये सेव्ह करण्याची browser download विनंती केली जाते; browser settings नुसार download confirmation दिसू शकते.

## Known limitations
- हे **pilot starter** आहे, अद्याप संस्थेच्या खात्यात live deploy केलेले नाही.
- Google Apps Script web app वरून localhost scanner bridge ला fetch करण्यास Chrome कडून Local Network Access / CORS अडथळा येऊ शकतो. प्रत्येक Chrome version आणि scanner model वर चाचणी आवश्यक आहे.
- कर्मचारी यादी, शाळा आणि कागदपत्र प्रकार हे Google Sheets मध्ये भरल्याशिवाय dropdown पूर्ण होणार नाहीत.
- मोठ्या फाइल्स, multi-user concurrent scans, full-text OCR, versioning आणि admin-level detailed reporting या टप्प्यांमध्ये वाढवता येतील.
