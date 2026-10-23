/* Render only published CMS records, safely and without interrupting an active form. */
(() => {
  'use strict';
  let content = {clients:[],projects:[],jobs:[]}, signature = '', refreshing = false, pendingRender = false;
  const t = value => window.karI18n?.t(value) ?? value;
  const field = (record,key) => window.karI18n?.language === 'ta' && record[`${key}Ta`] ? record[`${key}Ta`] : record[key];
  const element = (tag,className,text) => {
    const node = document.createElement(tag); if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  };
  const link = (href,text) => {
    const node = element('a','',text); node.href = href; node.target = '_blank'; node.rel = 'noopener noreferrer'; return node;
  };
  const safeUrl = (value,allowLocal = false) => {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value,location.origin);
      return url.protocol === 'https:' || (allowLocal && url.origin === location.origin && url.pathname.startsWith('/media/')) ? url.href : '';
    } catch { return ''; }
  };
  function render() {
    if (document.querySelector('dialog[open]') || document.activeElement?.closest('#client-logos,#project-grid,#job-list')) { pendingRender = true; return; }
    pendingRender = false;
    const logos = document.querySelector('#client-logos'); logos.replaceChildren();
    logos.hidden = !content.clients.length;
    content.clients.forEach(client => {
      const card = element('div','client-logo'); card.dataset.noTranslate = '';
      const src = safeUrl(client.logo,true);
      if (src) {
        const mark = element('div','client-logo-mark'), image = element('img');
        image.src = src; image.alt = client.name; image.loading = 'lazy'; image.decoding = 'async';
        mark.append(image); card.append(mark);
      }
      const name = element('span','client-logo-name',client.name);
      if (src) name.ariaHidden = 'true';
      card.append(name); logos.append(card);
    });
    const projects = document.querySelector('#project-grid'); projects.replaceChildren(); projects.hidden = !content.projects.length;
    document.querySelector('#works .works-heading > p').hidden = !!content.projects.length;
    content.projects.forEach(project => {
      const card = element('article','content-card'); card.dataset.noTranslate = '';
      const src = safeUrl(project.image,true);
      if (src) { const image = element('img'); image.src = src; image.alt = field(project,'title'); image.loading = 'lazy'; card.append(image); }
      card.append(element('h3','',field(project,'title')));
      if (project.clientName) card.append(element('p','content-meta',project.clientName));
      card.append(element('p','',field(project,'summary')));
      const href = safeUrl(project.url);
      if (href) card.append(link(href,t('View project')));
      projects.append(card);
    });
    const jobs = document.querySelector('#job-list'); jobs.replaceChildren(); jobs.hidden = !content.jobs.length;
    document.querySelector('#jobs-empty').hidden = !!content.jobs.length;
    content.jobs.forEach(job => {
      const card = element('article','content-card job-card'); card.dataset.noTranslate = '';
      const levels = {fresher:'Freshers welcome',experienced:'Experienced candidates',any:'Freshers and experienced candidates'};
      const nature = {'remote':'Remote','hybrid':'Hybrid','on-site':'On-site',onsite:'On-site'}[job.nature] ?? job.nature;
      const meta = [field(job,'location'),field(job,'type'),t(nature),t(levels[job.candidateLevel] ?? levels.any)].filter(Boolean);
      card.append(element('h3','',field(job,'title')),element('p','content-meta',meta.join(' · ')));
      if (job.candidateLevel !== 'fresher' && Number(job.experienceMin) > 0) card.append(element('p','content-meta',`${t('Minimum experience (years)')}: ${job.experienceMin}`));
      card.append(element('p','job-description',field(job,'description')));
      const apply = element('button','button button-dark job-apply',t('Apply for this role')); apply.type = 'button';
      apply.addEventListener('click',() => {
        const current = content.jobs.find(item => item.id === job.id);
        if (!current) { apply.textContent = t('This role is no longer available.'); apply.disabled = true; return; }
        window.karForms?.openApplication(current,apply);
      });
      card.append(apply); jobs.append(card);
    });
    document.dispatchEvent(new CustomEvent('kar:clientschange'));
  }
  async function refresh() {
    if (refreshing || document.hidden) return;
    refreshing = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),15000);
    try {
      const response = await fetch('/api/content',{cache:'no-store',signal:controller.signal});
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error();
      const data = await response.json();
      if (!['clients','projects','jobs'].every(key => Array.isArray(data[key]))) throw new Error();
      const nextSignature = JSON.stringify(data);
      if (nextSignature !== signature) { signature = nextSignature; content = data; render(); }
    } catch { /* Keep the previous content or the initial honest empty state if the backend is unavailable. */ }
    finally { clearTimeout(timeout); refreshing = false; }
  }
  refresh();
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',() => { if (!document.hidden) refresh(); });
  document.addEventListener('kar:languagechange',render);
  document.addEventListener('kar:formclosed',() => { if (pendingRender) render(); });
  document.addEventListener('focusout',() => { if (pendingRender) setTimeout(render,0); });
  setInterval(refresh,45000);
})();
