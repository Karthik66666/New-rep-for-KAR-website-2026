(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const names = {jobs:'Job postings',clients:'Client logos',projects:'Projects',contacts:'CRM contacts',applications:'Job applications',employees:'Employees',users:'Team access'};
  const permissions = {jobs:'cms',clients:'cms',projects:'cms',contacts:'crm',applications:'hr',employees:'hr'};
  const descriptions = {
    jobs:'Published roles appear in Careers with an application form. Add job-specific questions below the standard applicant information.',
    clients:'Approved, published logos appear in the client section of your website.',
    projects:'Share completed work approved for public display. Published projects appear on your website.',
    contacts:'Private enquiries and contacts, deal stages, notes and follow-up dates.',
    applications:'Read applicant details and job-specific answers, then manage each application stage.',
    employees:'Keep employee details, joining dates and employment status together. Employee records do not create login access.',
    users:'Create worker logins and assign access to website content, CRM and people management.'
  };
  const stages = {contacts:['New','Contacted','Proposal','Won','Lost'],applications:['New','Reviewing','Interview','Offered','Hired','Rejected']};
  const schemas = {
    jobs:[['title','Job title'],['description','Job description','textarea'],['location','Location'],['type','Employment type'],['nature','Work arrangement','select',['Remote','Hybrid','On-site']],['candidateLevel','Candidate experience','select',[['fresher','Freshers'],['experienced','Experienced candidates'],['any','Freshers and experienced candidates']]],['experienceMin','Minimum years of experience','number']],
    clients:[['name','Client name'],['logo','Logo','image']],
    projects:[['title','Project title'],['summary','Project summary','textarea'],['clientName','Client name'],['url','Live project URL','url'],['image','Project image','image']],
    contacts:[['name','Contact name'],['email','Email address','email'],['company','Company'],['countryCode','Country calling code'],['phone','Phone number','tel'],['address','Address','textarea'],['stage','Stage','select',stages.contacts],['nextFollowUp','Next follow-up','date'],['notes','Private notes','textarea']],
    employees:[['name','Employee name'],['email','Email address','email'],['phone','Phone number','tel'],['department','Department'],['jobTitle','Job title'],['employmentType','Employment type'],['status','Employment status','select',['Active','On leave','Exited']],['joiningDate','Joining date','date'],['manager','Manager'],['notes','Private notes','textarea']],
    applications:[['stage','Application stage','select',stages.applications],['notes','Private hiring notes','textarea']],
    users:[['name','Name'],['email','Email address','email'],['role','Role','select',[['admin','Administrator'],['sales','Sales team'],['employee','Employee'],['super_admin','Super administrator']]],['password','Password','password']]
  };
  const roleDefaults = {super_admin:['cms','crm','hr'],admin:['cms','hr'],sales:['crm'],employee:[]};
  const fieldLimits = {
    jobs:{title:180,description:10000,location:160,type:80},
    clients:{name:160,logo:500},
    projects:{title:180,summary:8000,clientName:160,url:500,image:500},
    contacts:{name:160,email:200,company:180,countryCode:5,phone:60,address:2000,notes:15000},
    employees:{name:160,email:200,phone:60,department:160,jobTitle:180,employmentType:100,manager:160,notes:15000},
    applications:{notes:15000},users:{name:160,email:200,password:200}
  };
  const permissionLabels = {cms:'Website CMS — jobs, client logos and projects',crm:'CRM — enquiries, contacts and follow-ups',hr:'People — employees and job applications'};
  let csrf = '', setup = false, currentUser = null, view = 'dashboard', editing = null, editingView = '', stage = 'All', records = {}, loadErrors = {}, questionRows = [];
  let editorRevision = 0, pendingUploads = 0, savingRecord = false;
  const updateSaveState = () => { $('#save-record').disabled = pendingUploads > 0 || savingRecord; };
  const node = (tag,className,text) => { const element = document.createElement(tag); if (className) element.className = className; if (text != null) element.textContent = text; return element; };
  const status = (selector,text,error=false) => { $(selector).textContent = text; $(selector).classList.toggle('error',error); };
  const canAccess = resource => !!currentUser && (currentUser.role === 'super_admin' || (resource !== 'users' && currentUser.permissions?.includes(permissions[resource])));
  const availableResources = () => Object.keys(names).filter(canAccess);
  async function api(path,method='GET',data) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),30000);
    try {
      const response = await fetch(`/api/admin/${path}`,{method,signal:controller.signal,headers:{'Content-Type':'application/json','X-KAR-Request':'1','X-CSRF-Token':csrf},...(data !== undefined ? {body:JSON.stringify(data)} : {})});
      let body;
      try { body = await response.json(); } catch (error) {
        if (error.name === 'AbortError') throw error;
        throw new Error('The server returned an unreadable response. Try again shortly.');
      }
      if (!response.ok) {
        if (response.status === 401 && !['login','setup'].includes(path) && !(path === 'password' && body.error === 'Current password is incorrect.')) showAuth('Your session ended. Sign in again to continue.');
        throw new Error(body.error ?? 'Request failed.');
      }
      return body;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(method === 'GET' ? 'The request timed out. Use Refresh data to try again.' : 'The save could not be confirmed. Refresh your records before trying again.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function showAuth(message='') {
    currentUser = null; csrf = ''; records = {}; loadErrors = {};
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    $('#workspace').hidden = true; $('#auth-screen').hidden = false;
    if (message) status('#auth-status',message,true);
  }
  async function load() {
    const keys = availableResources(); const results = await Promise.allSettled(keys.map(key => api(key)));
    if (!currentUser) return;
    records = {}; loadErrors = {};
    results.forEach((result,index) => {
      if (result.status === 'fulfilled') records[keys[index]] = result.value.items ?? [];
      else { records[keys[index]] = []; loadErrors[keys[index]] = result.reason.message; }
    });
    if (view !== 'dashboard' && !canAccess(view)) view = 'dashboard'; render();
    if (Object.keys(loadErrors).length) status('#workspace-status','Some workspace data could not be loaded. Use Refresh data to try again.',true);
  }
  async function showWorkspace(user) {
    currentUser = user; $('#signed-in').textContent = `${user.name || user.email} · ${user.role.replaceAll('_',' ')}`;
    $('#auth-screen').hidden = true; $('#workspace').hidden = false; $('#login-form').reset();
    $('#auth-title').textContent = 'Sign in'; $('#auth-submit').textContent = 'Sign in'; $('#auth-note').textContent = 'Use your workspace account.';
    $('#auth-password').minLength = 0; $('#auth-password').autocomplete = 'current-password'; $('#setup-name-label').hidden = true; $('#setup-name').required = false;
    document.querySelectorAll('[data-view]').forEach(button => { button.hidden = button.dataset.view !== 'dashboard' && !canAccess(button.dataset.view); });
    await load();
  }
  function changeView(value) {
    if (value !== 'dashboard' && !canAccess(value)) return;
    view = value; stage = 'All'; $('#show-archived').checked = false; status('#workspace-status',''); render();
  }
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click',() => changeView(button.dataset.view)));
  function recordDetails(item) {
    if (view === 'contacts') return [item.company,item.email,item.source && `Source: ${item.source}`,item.nextFollowUp && `Follow-up: ${item.nextFollowUp}`];
    if (view === 'jobs') return [item.location,item.type,item.nature,item.candidateLevel === 'fresher' ? 'Freshers' : item.candidateLevel === 'experienced' ? 'Experienced' : 'All experience levels'];
    if (view === 'applications') return [item.jobTitle,item.email,item.createdAt && `Received: ${new Date(item.createdAt).toLocaleDateString()}`];
    if (view === 'employees') return [item.department,item.jobTitle,item.email];
    if (view === 'users') return [item.email,item.role?.replaceAll('_',' '),(item.permissions ?? []).map(permission => permission.toUpperCase()).join(', ') || 'No module access'];
    return [item.clientName];
  }
  function render() {
    $('#view-title').textContent = names[view] ?? 'Overview';
    document.querySelectorAll('.sidebar [data-view]').forEach(button => { if (button.dataset.view === view) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
    $('#overview').hidden = view !== 'dashboard'; $('#resource-view').hidden = view === 'dashboard';
    if (view === 'dashboard') {
      $('#metrics').replaceChildren(...availableResources().map(key => {
        const card = node('button','metric'); card.type = 'button'; card.append(node('strong','',loadErrors[key] ? '—' : String((records[key]??[]).filter(item => !item.archived && (key !== 'users' || item.active !== false)).length)),node('span','',names[key]));
        card.addEventListener('click',() => changeView(key)); return card;
      })); $('#no-access').hidden = availableResources().length > 0; return;
    }
    $('#resource-description').textContent = descriptions[view]; $('#new-record').hidden = view === 'applications' || !!loadErrors[view]; $('#archive-filter').hidden = view === 'users'; $('#pipeline').hidden = !stages[view];
    if (stages[view]) $('#pipeline').replaceChildren(...['All',...stages[view]].map(value => {
      const count = (records[view]??[]).filter(item => !!item.archived === $('#show-archived').checked && (value === 'All' || item.stage === value)).length;
      const button = node('button','',`${value} · ${count}`); button.type = 'button'; button.setAttribute('aria-pressed',String(stage === value)); button.addEventListener('click',() => { stage = value; render(); }); return button;
    }));
    const items = (records[view]??[]).filter(item => (view === 'users' || !!item.archived === $('#show-archived').checked) && (!stages[view] || stage === 'All' || item.stage === stage));
    $('#records').replaceChildren(...items.map(item => {
      const card = node('article','record');
      if (item.logo || item.image) { const image = node('img'), source = item.logo || item.image; image.src = source.startsWith('/media/') ? `/api/admin${source}` : source; image.alt = item.name || item.title || ''; card.append(image); }
      const info = node('div'); info.append(node('h3','',item.title || item.name || 'Application'));
      const badgeText = view === 'users' ? (item.active === false ? 'Access disabled' : 'Access enabled') : item.archived ? 'Archived' : item.status || item.stage;
      info.append(node('p','',recordDetails(item).filter(Boolean).join(' · ')),node('span',`badge ${item.status??''}`,badgeText));
      const actions = node('div','record-actions'); const edit = node('button','',view === 'applications' ? 'Review application' : 'Edit'); edit.type = 'button'; edit.addEventListener('click',() => editRecord(item)); actions.append(edit);
      if (view !== 'users') {
        const archive = node('button','',item.archived ? 'Restore' : 'Archive'); archive.type = 'button';
        archive.addEventListener('click',async () => {
          archive.disabled = true; const resource = view;
          try { await api(`${resource}/${item.id}`,item.archived ? 'PATCH' : 'DELETE',item.archived ? {archived:false} : undefined); await load(); status('#workspace-status',item.archived ? 'Record restored.' : 'Record archived. You can restore it from Show archived.'); }
          catch (error) { status('#workspace-status',error.message,true); archive.disabled = false; }
        }); actions.append(archive);
      }
      card.append(info,actions); return card;
    }));
    if (loadErrors[view]) $('#records').replaceChildren(node('p','empty-state error',loadErrors[view]));
    else if (!items.length) $('#records').append(node('p','empty-state',view === 'applications' ? 'No applications in this view yet. Applications submitted through a published job will appear here.' : $('#show-archived').checked ? 'No archived records.' : 'Nothing here yet. Add your first record to get started.'));
  }
  function addDetail(list,label,value) {
    if (value === undefined || value === null || value === '') return;
    list.append(node('dt','',label),node('dd','',typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)));
  }
  function addSubmissionDetails(item,resource) {
    const wrapper = node('section','full submission-details'); wrapper.append(node('h3','',resource === 'applications' ? 'Submitted application' : 'Website enquiry')); const list = node('dl','detail-list');
    if (resource === 'applications') {
      const data = {...item,...item.applicant};
      for (const [key,label] of [['jobTitle','Role applied for'],['name','Name'],['email','Email'],['degree','Degree / qualification'],['experienceType','Experience level'],['yearsExperience','Years of experience'],['latestCompany','Latest company'],['noticePeriod','Notice period'],['address','Address'],['portfolioUrl','Portfolio / resume link']]) addDetail(list,label,data[key]);
      addDetail(list,'Phone',[data.countryCode,data.phone].filter(Boolean).join(' ')); addDetail(list,'Received',item.createdAt ? new Date(item.createdAt).toLocaleString() : '');
      const questions = item.questions ?? item.questionSnapshot ?? [];
      for (const [key,value] of Object.entries(item.answers ?? {})) { const question = questions.find?.(entry => entry.id === key); addDetail(list,question?.label || key,Array.isArray(value) ? value.join(', ') : value); }
    } else {
      addDetail(list,'Source',item.source); addDetail(list,'Service',item.service); addDetail(list,'Project / enquiry',item.message); addDetail(list,'Budget',item.budget); addDetail(list,'Timeline',item.timeline); addDetail(list,'Received',item.createdAt ? new Date(item.createdAt).toLocaleString() : '');
    }
    wrapper.append(list); $('#editor-fields').append(wrapper);
  }
  function appendField([key,label,type='text',options],item) {
    const wrapper = node('label',type === 'textarea' || type === 'image' ? 'full' : ''); wrapper.append(node('span','',label)); let input;
    if (type === 'textarea') { input = node('textarea'); input.rows = 4; input.maxLength = key === 'notes' ? 15000 : 10000; }
    else if (type === 'select') { input = node('select'); options.forEach(entry => { const [value,text] = Array.isArray(entry) ? entry : [entry,entry]; const option = node('option','',text); option.value = value; input.append(option); }); }
    else { input = node('input'); input.type = type === 'image' ? 'text' : type; input.maxLength = type === 'password' ? 200 : 500; }
    input.name = key; input.value = type === 'password' ? '' : item?.[key] ?? (type === 'select' ? input.options[0].value : key === 'experienceMin' ? '0' : '');
    input.required = ['name','title'].includes(key) || (view === 'users' && ['email','role'].includes(key)) || (view === 'jobs' && key === 'description');
    if (fieldLimits[view]?.[key]) input.maxLength = fieldLimits[view][key];
    if (type === 'password') { input.autocomplete = 'new-password'; input.minLength = 12; input.required = !item; wrapper.append(node('small','hint',item ? 'Leave blank to keep the current password. Use at least 12 characters to change it.' : 'Set a unique password of at least 12 characters. Share it privately with this worker.')); }
    if (type === 'number') { input.min = '0'; input.max = '70'; input.step = '0.01'; } wrapper.append(input); if (key === 'experienceMin') wrapper.dataset.experienceField = '';
    if (type === 'image') {
      input.readOnly = true; input.placeholder = 'Upload an image below'; const file = node('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.setAttribute('aria-label',`Upload ${label.toLowerCase()}`);
      let uploadVersion = 0;
      file.addEventListener('change',async () => {
        const selected = file.files[0]; if (!selected) return;
        if (selected.size > 2*1024*1024) { status('#editor-status','Choose an image smaller than 2 MB.',true); return; }
        const revision = editorRevision, version = ++uploadVersion; pendingUploads++; updateSaveState(); status('#editor-status','Uploading image…');
        try {
          const data = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The image could not be read.')); reader.readAsDataURL(selected); });
          if (revision !== editorRevision) return;
          const result = await api('uploads','POST',{data});
          if (revision === editorRevision && version === uploadVersion) { input.value = result.url; status('#editor-status','Image ready. Save the record to use it.'); }
        }
        catch (error) { if (revision === editorRevision && version === uploadVersion) status('#editor-status',error.message,true); }
        finally { if (revision === editorRevision) { pendingUploads--; updateSaveState(); } }
      }); wrapper.append(file,node('small','hint','PNG, JPEG or WebP · up to 2 MB. Upload only artwork approved for public use.'));
    }
    $('#editor-fields').append(wrapper); return input;
  }
  function renderQuestions(container) {
    container.replaceChildren();
    questionRows.forEach((question,index) => {
      const card = node('fieldset','question-card'); card.append(node('legend','',`Question ${index+1}`)); const label = node('label'); label.append(node('span','','Question'));
      const input = node('input'); input.value = question.label; input.required = true; input.maxLength = 300; input.addEventListener('input',() => { question.label = input.value; }); label.append(input); card.append(label);
      const controls = node('div','question-controls'); const typeLabel = node('label'); typeLabel.append(node('span','','Answer format')); const select = node('select');
      [['text','Short text'],['textarea','Long text'],['select','Choose an option'],['checkbox','Yes / no checkbox']].forEach(([value,text]) => { const option = node('option','',text); option.value = value; select.append(option); }); select.value = question.type; typeLabel.append(select); controls.append(typeLabel);
      const required = node('label','check'); const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = question.required; checkbox.addEventListener('change',() => { question.required = checkbox.checked; }); required.append(checkbox,node('span','','Required')); controls.append(required); card.append(controls);
      const optionLabel = node('label'); optionLabel.append(node('span','','Choices — one per line')); const optionInput = node('textarea'); optionInput.rows = 3; optionInput.maxLength = 3000; optionInput.value = (question.options ?? []).join('\n'); optionInput.addEventListener('input',() => { question.options = optionInput.value.split('\n').map(value => value.trim()).filter(Boolean); }); optionLabel.append(optionInput); optionLabel.hidden = question.type !== 'select'; optionInput.required = question.type === 'select'; card.append(optionLabel);
      select.addEventListener('change',() => { question.type = select.value; optionLabel.hidden = select.value !== 'select'; optionInput.required = select.value === 'select'; });
      const actions = node('div','question-actions'); [['Move up',-1],['Move down',1]].forEach(([text,offset]) => { const button = node('button','secondary',text); button.type = 'button'; button.disabled = index + offset < 0 || index + offset >= questionRows.length; button.addEventListener('click',() => { [questionRows[index],questionRows[index+offset]] = [questionRows[index+offset],questionRows[index]]; renderQuestions(container); container.children[index+offset]?.querySelector('input')?.focus(); }); actions.append(button); });
      const remove = node('button','secondary','Remove question'); remove.type = 'button'; remove.addEventListener('click',() => { questionRows.splice(index,1); renderQuestions(container); (container.children[Math.min(index,questionRows.length-1)]?.querySelector('input') || container.parentElement.querySelector('.add-question'))?.focus(); }); actions.append(remove); card.append(actions); container.append(card);
    });
    if (!questionRows.length) container.append(node('p','hint','No additional questions yet. Applicants still complete the standard information.'));
  }
  function addJobQuestions(item) {
    const wrapper = node('section','full question-builder'); wrapper.append(node('h3','','Application questions'),node('p','hint','The application already includes name, email, country code and phone, address and qualification. Experienced candidates also provide years of experience, latest company and notice period. Add questions specific to the role and job description.'));
    const list = node('div','question-list'); const add = node('button','secondary add-question','Add a job-specific question'); add.type = 'button'; questionRows = (item?.questions ?? []).map(question => ({...question,options:[...(question.options ?? [])]}));
    add.addEventListener('click',() => { if (questionRows.length >= 30) { status('#editor-status','A job can have up to 30 additional questions.',true); return; } questionRows.push({id:`q-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)+Math.random().toString(36).slice(2)}`,label:'',type:'text',required:false,options:[]}); renderQuestions(list); list.lastElementChild?.querySelector('input')?.focus(); }); wrapper.append(list,add); $('#editor-fields').append(wrapper); renderQuestions(list);
    const level = $('#editor-fields [name=candidateLevel]'); const experienceField = $('#editor-fields [data-experience-field]'); const updateLevel = () => { experienceField.hidden = level.value !== 'experienced'; if (level.value !== 'experienced') experienceField.querySelector('input').value = '0'; }; level.addEventListener('change',updateLevel); updateLevel();
  }
  function addUserPermissions(item) {
    const wrapper = node('fieldset','full permission-editor'); wrapper.append(node('legend','','Workspace access'),node('p','hint','Super administrators have every permission and manage worker access. Assign individual modules to other roles.')); const role = $('#editor-fields [name=role]');
    for (const permission of Object.keys(permissionLabels)) { const label = node('label','check'); const input = node('input'); input.type = 'checkbox'; input.name = 'permission'; input.value = permission; label.append(input,node('span','',permissionLabels[permission])); wrapper.append(label); }
    const updatePermissions = values => wrapper.querySelectorAll('[name=permission]').forEach(input => { input.checked = role.value === 'super_admin' || values.includes(input.value); input.disabled = role.value === 'super_admin'; }); updatePermissions(item?.permissions ?? roleDefaults[role.value]); role.addEventListener('change',() => updatePermissions(roleDefaults[role.value]));
    const activeLabel = node('label','full check'); const active = node('input'); active.name = 'active'; active.type = 'checkbox'; active.checked = item?.active !== false; activeLabel.append(active,node('span','','Login enabled')); $('#editor-fields').append(wrapper,activeLabel,node('p','full hint','Disable login to revoke a worker’s access. Employee records and workspace logins are managed separately.'));
  }
  function editRecord(item=null) {
    if (!canAccess(view) || (view === 'applications' && !item)) return;
    editorRevision++; pendingUploads = 0; savingRecord = false; updateSaveState();
    editing = item; editingView = view; questionRows = []; $('#record-form').reset(); $('#editor-fields').replaceChildren(); status('#editor-status',''); const singular = {contacts:'contact',clients:'client logo',projects:'project',jobs:'job posting',employees:'employee',users:'worker login',applications:'application'};
    $('#editor-title').textContent = `${view === 'applications' ? 'Review' : item ? 'Edit' : 'New'} ${singular[view]}`;
    if (item && (view === 'applications' || (view === 'contacts' && item.source))) addSubmissionDetails(item,view); schemas[view].forEach(field => appendField(field,item));
    if (['jobs','clients','projects'].includes(view)) {
      appendField(['status','Publication','select',[['draft','Draft · private'],['published','Published · visible on website']]],item);
      if (['clients','projects'].includes(view)) { const approval = node('label','full check'); const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.name = 'publicApproved'; checkbox.checked = item?.publicApproved ?? false; approval.append(checkbox,node('span','','I have permission to publish this client name, logo, project details and images.')); $('#editor-fields').append(approval); }
    }
    if (view === 'jobs') addJobQuestions(item); if (view === 'users') addUserPermissions(item); $('#record-dialog').showModal();
  }
  $('#new-record').addEventListener('click',() => editRecord()); $('#show-archived').addEventListener('change',render);
  $('#refresh-data').addEventListener('click',async event => { event.currentTarget.disabled = true; status('#workspace-status','Refreshing…'); try { await load(); if (!Object.keys(loadErrors).length) status('#workspace-status','Workspace data refreshed.'); } finally { $('#refresh-data').disabled = false; } });
  document.querySelectorAll('[data-close-dialog]').forEach(button => button.addEventListener('click',() => $('#record-dialog').close()));
  $('#record-dialog').addEventListener('close',() => { editorRevision++; pendingUploads = 0; updateSaveState(); });
  $('#record-form').addEventListener('submit',async event => {
    event.preventDefault(); const resource = editingView; if (!canAccess(resource) || savingRecord) return;
    if (pendingUploads) { status('#editor-status','Wait for your image upload to finish before saving.',true); return; }
    const revision = editorRevision, record = editing; savingRecord = true; updateSaveState(); status('#editor-status','Saving…'); const form = new FormData(event.currentTarget); const input = Object.fromEntries(form);
    if (['clients','projects'].includes(resource)) input.publicApproved = form.has('publicApproved');
    if (resource === 'jobs') { input.experienceMin = String(input.experienceMin || '0'); input.questions = questionRows.map(question => ({id:question.id,label:question.label.trim(),type:question.type,required:!!question.required,...(question.type === 'select' ? {options:question.options ?? []} : {})})); }
    if (resource === 'users') { input.permissions = input.role === 'super_admin' ? ['cms','crm','hr'] : form.getAll('permission'); input.active = form.has('active'); delete input.permission; if (editing && !input.password) delete input.password; }
    try {
      await api(`${resource}${record ? `/${record.id}` : ''}`,record ? 'PUT' : 'POST',input); if (revision === editorRevision) $('#record-dialog').close();
      if (resource === 'users' && record?.id === currentUser?.id) { const session = await api('session'); if (!session.user) { showAuth('Account updated. Sign in again with your current credentials.'); return; } csrf = session.csrf; await showWorkspace(session.user); } else await load();
      status('#workspace-status',resource === 'jobs' && input.status === 'published' ? 'Job published. It is now available in Careers on the website.' : ['clients','projects'].includes(resource) && input.status === 'published' ? 'Published successfully. Refresh the website to see this content.' : 'Saved successfully.');
    }
    catch (error) { if (revision === editorRevision) status('#editor-status',error.message,true); }
    finally { if (revision === editorRevision || !$('#record-dialog').open) { savingRecord = false; updateSaveState(); } }
  });
  $('#login-form').addEventListener('submit',async event => { event.preventDefault(); $('#auth-submit').disabled = true; status('#auth-status',setup ? 'Creating your account…' : 'Signing in…'); try { const result = await api(setup ? 'setup' : 'login','POST',Object.fromEntries(new FormData(event.currentTarget))); csrf = result.csrf; setup = false; status('#auth-status',''); await showWorkspace(result.user); } catch (error) { status('#auth-status',error.message,true); } finally { $('#auth-submit').disabled = false; } });
  $('#logout').addEventListener('click',async () => { try { await api('logout','POST'); view = 'dashboard'; showAuth(); } catch (error) { status('#workspace-status',error.message,true); } });
  $('#password-open').addEventListener('click',() => { $('#password-form').reset(); status('#password-status',''); $('#password-dialog').showModal(); }); $('[data-close-password]').addEventListener('click',() => $('#password-dialog').close());
  $('#password-form').addEventListener('submit',async event => { event.preventDefault(); const button = event.currentTarget.querySelector('[type=submit]'); button.disabled = true; try { const result = await api('password','POST',Object.fromEntries(new FormData(event.currentTarget))); csrf = result.csrf; $('#password-dialog').close(); status('#workspace-status','Password updated.'); } catch (error) { status('#password-status',error.message,true); } finally { button.disabled = false; } });
  api('session').then(async session => {
    if (session.user) { csrf = session.csrf; await showWorkspace(session.user); return; } setup = !session.initialized && session.setupAllowed;
    if (setup) { $('#auth-title').textContent = 'Create your super admin account'; $('#auth-submit').textContent = 'Create account'; $('#auth-note').textContent = 'First-time local setup. Choose your own email and a password of at least 12 characters. This account manages all content, CRM, employees and worker access.'; $('#auth-password').minLength = 12; $('#auth-password').autocomplete = 'new-password'; $('#setup-name-label').hidden = false; $('#setup-name').required = true; }
    else if (!session.initialized) { $('#auth-note').textContent = 'Administrator setup must be completed locally before production hosting.'; $('#auth-submit').disabled = true; }
  }).catch(() => { status('#auth-status','The backend is unavailable. Start this project with npm run dev to use the admin panel.',true); $('#auth-submit').disabled = true; });
})();
