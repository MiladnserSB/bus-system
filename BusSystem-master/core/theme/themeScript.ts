export const THEME_STORAGE_KEY = 'masar_theme';

export const themeInitScript = `(function(){try{var s=localStorage.getItem("${THEME_STORAGE_KEY}")||"light";var d=s==="dark"||(s==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
