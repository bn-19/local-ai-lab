const profiles = {
  candy: {
    request: 'Recognize the candy in a photo and tell me which types are there.',
    label: 'Choose sample images', accept: 'image/*', multiple: true,
    upload: 'A few examples make the task clearer',
    detail: 'For training, we’ll also need the correct candy labels.',
    description: 'Start with a pretrained vision model. Teach it the candy types you care about using labeled examples.',
    task: 'Identify types, or locate and count visible candies.',
    model: 'A small classifier or object detector, depending on the output.',
    check: 'Test on separate photos. Keep an improvement only if it helps.',
    output: 'Candy labels on your photo, with counts when detection is supported.',
    summary: 'A vision recipe for a small, named set of candy types. Brand coverage depends on the labeled data.',
    steps: ['Confirm whether you need types present or boxes and counts.', 'Inspect approved images and labels, then separate training and test photos.', 'Measure a small pretrained baseline. Run a short tuning pilot only if needed.', 'Compare held-out results and save the model with its task settings.'],
  },
  analytics: {
    request: 'Turn my CSV into a dashboard showing trends and the groups that matter most.',
    label: 'Choose a CSV dataset', accept: '.csv,text/csv', multiple: false,
    upload: 'Bring a dataset you want to understand',
    detail: 'Start with a CSV. You’ll confirm the measures and questions.',
    description: 'Use a local text model to plan the analysis, with trusted tools to calculate numbers and draw charts.',
    task: 'Choose useful measures, filters and charts for your question.',
    model: 'A small local language model paired with calculation tools.',
    check: 'Check the operations and values against known answers.',
    output: 'A useful dashboard, with source details and calculations you can inspect.',
    summary: 'An analysis recipe that keeps calculations in trusted tools and makes the chosen measures visible.',
    steps: ['Inspect the selected CSV schema and ask about ambiguous measures.', 'Choose supported filters, aggregations and chart types.', 'Compare the plan and calculated outputs against checked examples.', 'Save a reusable recipe. Tune prompts or a small adapter only if failures justify it.'],
  },
};

const byId = (id) => document.getElementById(id);
let profile = 'candy';
const picker = byId('files');

function validateSelection() {
  const files = Array.from(picker.files || []);
  const invalid = files.some(file => profile === 'analytics'
    ? !file.name.toLowerCase().endsWith('.csv')
    : !(file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic|avif)$/i.test(file.name)));
  const status = byId('file-status');
  status.classList.toggle('error', invalid);
  byId('preview-plan').disabled = invalid;
  if (invalid) status.textContent = profile === 'analytics' ? 'Choose a CSV file for this recipe.' : 'Choose image files for this recipe.';
  else status.textContent = files.length ? `${files.length} selected: ${files.map(file => file.name).join(', ')}. File contents have not been read.` : 'No files selected.';
  return !invalid;
}

function setProfile(name) {
  const data = profiles[name];
  if (!data) return;
  profile = name;
  for (const button of document.querySelectorAll('[data-profile]')) {
    const selected = button.dataset.profile === name;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  byId('request').value = data.request;
  byId('input-label').textContent = data.label;
  picker.accept = data.accept;
  picker.multiple = data.multiple;
  picker.value = '';
  for (const [id, key] of [['upload-title','upload'],['upload-detail','detail'],['recipe-description','description'],['step-task','task'],['step-model','model'],['step-check','check'],['output-description','output']]) byId(id).textContent = data[key];
  byId('output-art').classList.toggle('chart-mode', name === 'analytics');
  byId('plan-result').hidden = true;
  validateSelection();
}

for (const button of document.querySelectorAll('[data-profile]')) button.addEventListener('click', () => setProfile(button.dataset.profile));
picker.addEventListener('change', validateSelection);
byId('preview-plan').addEventListener('click', () => {
  if (!validateSelection()) return;
  if (!byId('request').value.trim()) {
    byId('request').focus();
    byId('file-status').textContent = 'Describe the result you want before previewing the setup.';
    return;
  }
  const data = profiles[profile];
  byId('result-summary').textContent = data.summary;
  byId('result-steps').replaceChildren(...data.steps.map(text => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  }));
  byId('plan-result').hidden = false;
  byId('plan-result').focus({ preventScroll: true });
  byId('plan-result').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
});
