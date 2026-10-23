/* Small, independent appearance controls. Removing this module removes the effects. */
(() => {
  'use strict';
  const root = document.documentElement;
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key,value) => { try { localStorage.setItem(key,value); } catch { /* Private browsing still works. */ } };
  const system = matchMedia('(prefers-color-scheme: dark)');
  let theme = read('kar-theme');
  if (!['light','dark'].includes(theme)) theme = system.matches ? 'dark' : 'light';
  root.dataset.theme = theme;
  root.dataset.effects = read('kar-effects') === 'off' ? 'off' : 'on';
  function initialize() {
    const translate = text => window.karI18n?.t(text) ?? text;
    function updateControls() {
      document.querySelectorAll('[data-theme-toggle]').forEach(button => {
        button.setAttribute('aria-pressed',String(root.dataset.theme === 'dark'));
        button.textContent = translate(root.dataset.theme === 'dark' ? 'Light theme' : 'Dark theme');
      });
      document.querySelectorAll('[data-effects-toggle]').forEach(button => {
        button.setAttribute('aria-pressed',String(root.dataset.effects === 'on'));
        button.textContent = translate(root.dataset.effects === 'on' ? 'Effects on' : 'Effects off');
      });
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content',root.dataset.theme === 'dark' ? '#101722' : '#ffffff');
    }
    document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click',() => {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      write('kar-theme',root.dataset.theme); updateControls();
    }));
    document.querySelectorAll('[data-effects-toggle]').forEach(button => button.addEventListener('click',() => {
      root.dataset.effects = root.dataset.effects === 'on' ? 'off' : 'on';
      write('kar-effects',root.dataset.effects); updateControls();
    }));
    system.addEventListener('change',event => {
      if (!read('kar-theme')) { root.dataset.theme = event.matches ? 'dark' : 'light'; updateControls(); }
    });
    const sections = [...document.querySelectorAll('main > section')];
    sections.forEach(section => {
      const glow = document.createElement('div');
      glow.className = 'ambient-glow'; glow.setAttribute('aria-hidden','true');
      section.prepend(glow);
    });
    const visibility = () => root.classList.toggle('page-hidden',document.hidden);
    document.addEventListener('visibilitychange',visibility); visibility();
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        entry.target.classList.toggle('ambient-visible',entry.isIntersecting);
      }));
      sections.forEach(section => observer.observe(section));
    }
    document.addEventListener('kar:languagechange',updateControls);
    updateControls();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initialize);
  else initialize();
})();
