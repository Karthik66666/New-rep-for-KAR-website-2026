/* Public forms save through the Node API; success is shown only after the server confirms it. */
(() => {
  'use strict';
  const t = value => window.karI18n?.t(value) ?? value;
  const enquiryDialog = document.querySelector('#enquiry-dialog');
  const enquiryForm = document.querySelector('#enquiry-form');
  const enquiryResult = document.querySelector('#enquiry-result');
  const applicationDialog = document.querySelector('#application-dialog');
  const applicationForm = document.querySelector('#application-form');
  const applicationResult = document.querySelector('#application-result');
  const experience = applicationForm.elements.experienceType;
  const experiencedFields = document.querySelector('#experienced-fields');
  let activeJob = null, applicationSubmitting = false;

  function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
    document.body.classList.add('dialog-open');
  }
  [enquiryDialog,applicationDialog].forEach(dialog => {
    dialog.querySelector('.dialog-close').addEventListener('click',() => dialog.close());
    dialog.addEventListener('close',() => {
      document.body.classList.toggle('dialog-open',!!document.querySelector('dialog[open]'));
      document.dispatchEvent(new CustomEvent('kar:formclosed'));
    });
    dialog.addEventListener('click',event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  });
  function openEnquiry(service) {
    if (service && !enquiryForm.hidden) enquiryForm.elements.service.value = service;
    openDialog(enquiryDialog);
  }
  document.querySelector('#open-enquiry').addEventListener('click',() => openEnquiry());
  document.querySelectorAll('[data-open-enquiry]').forEach(link => link.addEventListener('click',event => {
    event.preventDefault(); openEnquiry();
  }));
  document.querySelectorAll('.service-enquire').forEach(button => button.addEventListener('click',() => openEnquiry(button.dataset.service)));
  document.querySelector('#new-enquiry').addEventListener('click',() => {
    enquiryForm.reset(); enquiryForm.hidden = false; enquiryResult.hidden = true;
    setStatus(enquiryForm,''); enquiryForm.elements.name.focus();
  });
  document.querySelector('[data-close-application]').addEventListener('click',() => applicationDialog.close());

  function setStatus(form,message,error = false) {
    const status = form.querySelector('.form-feedback'); status.textContent = t(message);
    status.classList.toggle('is-error',error);
  }
  function setBusy(form,busy) {
    form.setAttribute('aria-busy',String(busy));
    form.querySelector('[type=submit]').disabled = busy;
  }
  async function jsonRequest(url,options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),30000);
    try {
      const response = await fetch(url,{cache:'no-store',...options,signal:controller.signal});
      const isJson = response.headers.get('content-type')?.includes('application/json');
      if (!isJson) throw new Error(t('The forms service is unavailable. Your details are still here. Please try again.'));
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t('We could not save your details. Please try again.'));
      return result;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error(t('We could not confirm your submission. Your details are still here. Please try again.'));
      throw error;
    } finally { clearTimeout(timeout); }
  }
  async function save(url,payload) {
    // A new, one-use server challenge is obtained for every submission attempt.
    const challenge = await jsonRequest('/api/forms/challenge');
    if (typeof challenge.token !== 'string' || !challenge.token) throw new Error(t('The forms service is unavailable. Your details are still here. Please try again.'));
    const result = await jsonRequest(url,{method:'POST',headers:{'Content-Type':'application/json','X-KAR-Request':'1'},body:JSON.stringify({...payload,formToken:challenge.token})});
    if (result.ok !== true || typeof result.reference !== 'string') throw new Error(t('We could not confirm your submission. Your details are still here. Please try again.'));
    return result;
  }
  function basicPayload(form) {
    const data = new FormData(form), values = Object.fromEntries(data);
    return {...values,consent:form.elements.consent.checked,robotCheck:form.elements.robotCheck.checked,website:String(data.get('website') ?? '')};
  }
  function showSuccess(form,resultPanel,result) {
    setStatus(form,''); form.hidden = true; resultPanel.hidden = false;
    resultPanel.querySelector('.submission-reference').textContent = `${t('Reference')}: ${result.reference}`;
    resultPanel.focus();
  }
  enquiryForm.addEventListener('submit',async event => {
    event.preventDefault();
    if (enquiryForm.getAttribute('aria-busy') === 'true' || !enquiryForm.reportValidity()) return;
    setBusy(enquiryForm,true); setStatus(enquiryForm,'Sending your enquiry…');
    try { showSuccess(enquiryForm,enquiryResult,await save('/api/enquiries',basicPayload(enquiryForm))); }
    catch (error) { setStatus(enquiryForm,error.message,true); }
    finally { setBusy(enquiryForm,false); }
  });

  function updateExperience() {
    const experienced = experience.value === 'experienced';
    experiencedFields.hidden = !experienced; experiencedFields.disabled = !experienced;
  }
  experience.addEventListener('change',updateExperience);
  function addOption(select,value,label) {
    const option = document.createElement('option'); option.value = value; option.textContent = t(label); select.append(option);
  }
  function renderQuestions(job,previous = new Map()) {
    const container = document.querySelector('#job-question-fields'); container.replaceChildren();
    const questions = Array.isArray(job.questions) ? job.questions : [];
    document.querySelector('#job-questions').hidden = !questions.length;
    questions.forEach((question,index) => {
      const label = document.createElement('label');
      const text = document.createElement('span'); text.textContent = `${question.label}${question.required ? ' *' : ''}`; text.dataset.noTranslate = '';
      const type = ['textarea','select','checkbox'].includes(question.type) ? question.type : 'text';
      const control = document.createElement(type === 'textarea' || type === 'select' ? type : 'input');
      if (type === 'checkbox' || type === 'text') control.type = type;
      control.id = `application-question-${index}`; control.name = `question-${question.id}`; control.required = question.required === true;
      if (type === 'select') {
        addOption(control,'','Choose an answer');
        (Array.isArray(question.options) ? question.options : []).forEach(option => {
          const node = document.createElement('option'); node.value = option; node.textContent = option; node.dataset.noTranslate = ''; control.append(node);
        });
      } else if (type !== 'checkbox') { control.maxLength = type === 'textarea' ? 8000 : 1000; if (type === 'textarea') control.rows = 3; }
      const saved = previous.get(question.id);
      if (saved?.type === question.type) {
        if (type === 'checkbox') control.checked = saved.value === true;
        else control.value = saved.value;
      }
      if (type === 'checkbox') { label.className = 'check-field'; label.append(control,text); }
      else label.append(text,control);
      container.append(label);
    });
  }
  function openApplication(job) {
    const newRole = activeJob?.id !== job.id;
    if (!applicationSubmitting && (newRole || JSON.stringify(activeJob) !== JSON.stringify(job))) {
      const previous = new Map();
      if (!newRole) (activeJob.questions ?? []).forEach(question => {
        const control = applicationForm.elements.namedItem(`question-${question.id}`);
        previous.set(question.id,{type:question.type,value:question.type === 'checkbox' ? control?.checked : control?.value});
      });
      const previousExperience = experience.value;
      activeJob = job;
      if (newRole) {
        applicationForm.reset(); setStatus(applicationForm,'');
        applicationForm.hidden = false; applicationResult.hidden = true;
      } else if (!applicationForm.hidden) setStatus(applicationForm,'This role has been updated. Please review the questions before submitting.');
      applicationForm.elements.jobId.value = job.id;
      document.querySelector('#application-role').textContent = [job.title,job.location,job.type].filter(Boolean).join(' · ');
      experience.replaceChildren();
      const level = ['fresher','experienced'].includes(job.candidateLevel) ? job.candidateLevel : 'any';
      if (level === 'any') addOption(experience,'','Choose your experience level');
      if (level !== 'experienced') addOption(experience,'fresher','Fresher');
      if (level !== 'fresher') addOption(experience,'experienced','Experienced');
      if (!newRole && [...experience.options].some(option => option.value === previousExperience)) experience.value = previousExperience;
      experiencedFields.querySelector('[name=yearsExperience]').min = String(Number(job.experienceMin) > 0 ? job.experienceMin : 0);
      updateExperience(); renderQuestions(job,previous);
    }
    openDialog(applicationDialog);
  }
  applicationForm.elements.portfolioUrl.addEventListener('input',event => event.target.setCustomValidity(''));
  applicationForm.addEventListener('submit',async event => {
    event.preventDefault();
    if (applicationSubmitting || !activeJob) return;
    const portfolio = applicationForm.elements.portfolioUrl;
    portfolio.setCustomValidity(portfolio.value && !portfolio.value.startsWith('https://') ? t('Use an HTTPS link for your portfolio.') : '');
    if (!applicationForm.reportValidity()) return;
    applicationSubmitting = true; setBusy(applicationForm,true); setStatus(applicationForm,'Sending your application…');
    const values = basicPayload(applicationForm), answers = Object.create(null);
    (Array.isArray(activeJob.questions) ? activeJob.questions : []).forEach(question => {
      const control = applicationForm.elements.namedItem(`question-${question.id}`);
      answers[question.id] = question.type === 'checkbox' ? control?.checked === true : String(control?.value ?? '').trim();
      delete values[`question-${question.id}`];
    });
    if (values.experienceType === 'experienced') values.yearsExperience = Number(values.yearsExperience);
    try { showSuccess(applicationForm,applicationResult,await save('/api/applications',{...values,jobId:activeJob.id,answers})); }
    catch (error) { setStatus(applicationForm,error.message,true); }
    finally { applicationSubmitting = false; setBusy(applicationForm,false); }
  });
  window.karForms = {openEnquiry,openApplication};
})();
