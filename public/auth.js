function $(selector) {
  return document.querySelector(selector);
}

const form = $('.auth-form');
const submitButton = $('.auth-submit');
const errorBox = $('[data-auth-error]');

function setError(message) {
  if (errorBox) {
    errorBox.textContent = message || '';
  }
}

async function submitAuthForm(event) {
  event.preventDefault();

  if (!form) return;

  const mode = form.dataset.mode;
  const formData = new FormData(form);
  const payload = {
    email: String(formData.get('email') || '').trim(),
    password: String(formData.get('password') || ''),
  };

  setError('');
  submitButton.disabled = true;
  submitButton.textContent = mode === 'signup' ? 'Creating account...' : 'Signing in...';

  try {
    const response = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error || 'Something went wrong. Please try again.');
      return;
    }

    window.location.assign('/');
  } catch (error) {
    console.error('Auth request failed:', error);
    setError('Unable to reach the server right now. Please try again.');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = mode === 'signup' ? 'Create account' : 'Sign in';
  }
}

if (form) {
  form.addEventListener('submit', submitAuthForm);
}

document.querySelectorAll('[data-oauth-placeholder]').forEach((button) => {
  button.addEventListener('click', () => {
    setError('Google and Apple sign-in need OAuth provider setup first. We cannot ask users for their Google or Apple password directly.');
  });
});
