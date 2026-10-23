/* Human-readable, local dictionaries; visitors' text never goes to a translator. */
(() => {
  'use strict';
  let language = 'en', dictionary = {}, reverse = {};
  const originals = new WeakMap();
  const originalAttributes = new WeakMap();
  const attributes = ['aria-label','placeholder','alt','title'];
  const skip = element => element?.closest('script,style,svg,pre,[data-no-translate],#language-select');
  function translateText(node) {
    if (!node.nodeValue?.trim() || skip(node.parentElement)) return;
    const value = node.nodeValue;
    const trimmed = value.trim();
    let source = originals.get(node);
    if (!source || (trimmed !== source.trim() && trimmed !== dictionary[source.trim()])) {
      source = value.replace(trimmed,reverse[trimmed] ?? trimmed);
      originals.set(node,source);
    }
    const translated = language === 'ta' ? dictionary[source.trim()] ?? source.trim() : source.trim();
    const result = source.replace(source.trim(),translated);
    if (node.nodeValue !== result) node.nodeValue = result;
  }
  function translateTree(root) {
    if (root.nodeType === Node.TEXT_NODE) return translateText(root);
    if (root.nodeType !== Node.ELEMENT_NODE || skip(root)) return;
    const walker = document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) translateText(walker.currentNode);
    [root,...root.querySelectorAll('[aria-label],[placeholder],[alt],[title]')].forEach(element => {
      if (skip(element)) return;
      let saved = originalAttributes.get(element);
      if (!saved) { saved = {}; originalAttributes.set(element,saved); }
      attributes.forEach(attribute => {
        if (!element.hasAttribute(attribute)) return;
        const value = element.getAttribute(attribute);
        if (!saved[attribute] || ![saved[attribute],dictionary[saved[attribute]]].includes(value)) saved[attribute] = reverse[value] ?? value;
        const result = language === 'ta' ? dictionary[saved[attribute]] ?? saved[attribute] : saved[attribute];
        if (value !== result) element.setAttribute(attribute,result);
      });
    });
  }
  function setLanguage(value) {
    language = value === 'ta' ? 'ta' : 'en';
    document.documentElement.lang = language;
    try { localStorage.setItem('kar-language',language); } catch { /* Optional preference. */ }
    document.querySelector('#language-select').value = language;
    translateTree(document.documentElement);
    document.dispatchEvent(new CustomEvent('kar:languagechange',{detail:{language}}));
  }
  window.karI18n = {t:text => language === 'ta' ? dictionary[text] ?? text : text,get language() { return language; }};
  // Option values remain stable across translated labels and form submissions.
  document.querySelectorAll('#service-select option').forEach(option => {
    if (!option.hasAttribute('value')) option.value = option.textContent;
  });
  fetch('./locales/ta.json').then(response => {
    if (!response.ok) throw new Error('Translation unavailable');
    return response.json();
  }).then(data => {
    dictionary = data;
    reverse = Object.fromEntries(Object.entries(dictionary).map(([key,value]) => [value,key]));
    let saved = 'en'; try { saved = localStorage.getItem('kar-language') ?? 'en'; } catch { /* Optional preference. */ }
    setLanguage(saved);
    document.querySelector('#language-select').addEventListener('change',event => setLanguage(event.target.value));
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') translateText(record.target);
        else if (record.type === 'attributes') translateTree(record.target);
        else record.addedNodes.forEach(translateTree);
      }
    }).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes});
  }).catch(() => {
    const select = document.querySelector('#language-select');
    select.value = 'en'; select.disabled = true; select.title = 'Tamil translation could not load. Please refresh.';
  });
})();
