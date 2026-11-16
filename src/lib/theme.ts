export const THEME_STORAGE_KEY = "dcf-theme";

// Runs in <head> before the page paints, so a saved dark choice never flashes light first.
export const themeInitScript = `try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`;
