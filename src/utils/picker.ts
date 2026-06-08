import firebaseConfig from "../../firebase-applet-config.json";

let pickerApiLoaded = false;

export function loadPickerScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    // If google picker is already loaded, resolve immediately
    if (pickerApiLoaded && (window as any).google?.picker) {
      resolve();
      return;
    }

    const existingScript = document.getElementById("google-gapi-script");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "google-gapi-script";
      script.src = "https://apis.google.com/js/api.js";
      script.type = "text/javascript";
      script.onload = () => {
        initializeGapiPicker(resolve, reject);
      };
      script.onerror = (err) => {
        reject(new Error("Failed to load Google API script: " + err));
      };
      document.body.appendChild(script);
    } else {
      if ((window as any).gapi) {
        initializeGapiPicker(resolve, reject);
      } else {
        const timer = setInterval(() => {
          if ((window as any).gapi) {
            clearInterval(timer);
            initializeGapiPicker(resolve, reject);
          }
        }, 100);
        setTimeout(() => {
          clearInterval(timer);
          reject(new Error("Timeout waiting for gapi global."));
        }, 5000);
      }
    }
  });
}

function initializeGapiPicker(resolve: () => void, reject: (err: any) => void) {
  const gapi = (window as any).gapi;
  if (!gapi) {
    reject(new Error("gapi is not available on window."));
    return;
  }

  gapi.load("picker", {
    callback: () => {
      pickerApiLoaded = true;
      resolve();
    },
    onerror: (err: any) => {
      reject(new Error("Failed to load Google Picker module via gapi: " + err));
    }
  });
}

export interface PickerSelectedFile {
  id: string;
  name: string;
  mimeType: string;
}

export function openGooglePicker(
  accessToken: string,
  onFilePicked: (file: PickerSelectedFile) => void,
  onCancel?: () => void
): void {
  const google = (window as any).google;
  if (!google || !google.picker) {
    console.error("Google Picker library is not loaded yet.");
    return;
  }

  const apiKey = firebaseConfig.apiKey;
  const appId = firebaseConfig.messagingSenderId || firebaseConfig.projectId;

  // Create documents view inside picker
  const view = new google.picker.View(google.picker.ViewId.DOCS);
  
  // Custom filter for Google Docs, spreadsheets, presentations, and common text formats + PDFs
  view.setMimeTypes(
    "application/vnd.google-apps.document,application/vnd.google-apps.spreadsheet,application/vnd.google-apps.presentation,application/pdf,text/plain,text/markdown,text/csv,application/octet-stream"
  );

  const picker = new google.picker.PickerBuilder()
    .enableFeature(google.picker.Feature.NAV_HIDDEN)
    .setAppId(appId)
    .setDeveloperKey(apiKey)
    .setOAuthToken(accessToken)
    .addView(view)
    .setCallback((data: any) => {
      if (data.action === google.picker.Action.PICKED) {
        const docs = data.docs;
        if (docs && docs.length > 0) {
          docs.forEach((doc: any) => {
            onFilePicked({
              id: doc.id,
              name: doc.name,
              mimeType: doc.mimeType
            });
          });
        }
      } else if (data.action === google.picker.Action.CANCEL) {
        if (onCancel) onCancel();
      }
    })
    .build();

  picker.setVisible(true);
}
