(() => {
  const key = 'jason-portfolio-theme';
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  const storedTheme = () => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    const button = document.querySelector('.theme-toggle');
    if (!button) return;
    const dark = theme === 'dark';
    const label = `Switch to ${dark ? 'light' : 'dark'} mode`;
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.setAttribute('aria-pressed', String(dark));
  };

  const saved = storedTheme();
  applyTheme(saved === 'light' || saved === 'dark' ? saved : (systemDark.matches ? 'dark' : 'light'));

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(document.documentElement.dataset.theme);
    document.querySelector('.theme-toggle')?.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(key, next);
      } catch {
        // The selected theme still applies for this page when storage is unavailable.
      }
      applyTheme(next);
    });

    systemDark.addEventListener('change', (event) => {
      if (!storedTheme()) applyTheme(event.matches ? 'dark' : 'light');
    });
  });
})();
