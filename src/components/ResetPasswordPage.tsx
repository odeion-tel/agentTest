import { FC } from 'hono/jsx'

interface ResetPasswordPageProps {
  error?: string
  message?: string
  csrf_token: string
  token: string
}

export const ResetPasswordPage: FC<ResetPasswordPageProps> = ({ error, message, csrf_token, token }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Reset Password - Conversionware</title>
        <script src="https://unpkg.com/htmx.org@2.0.2"></script>
        <script src="https://unpkg.com/alpinejs@3.14.1/dist/cdn.min.js" defer></script>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>{`
          .error-message {
            background-color: #fee2e2;
            border: 1px solid #fecaca;
            color: #991b1b;
            padding: 0.75rem;
            border-radius: 0.375rem;
            margin-bottom: 1rem;
          }
          .success-message {
            background-color: #dcfce7;
            border: 1px solid #bbf7d0;
            color: #166534;
            padding: 0.75rem;
            border-radius: 0.375rem;
            margin-bottom: 1rem;
          }
          .password-requirements {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 0.375rem;
            padding: 1rem;
            margin-bottom: 1rem;
          }
          .requirement-met {
            color: #22c55e;
          }
          .requirement-not-met {
            color: #ef4444;
          }
        `}</style>
      </head>
      <body class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div class="sm:mx-auto sm:w-full sm:max-w-md">
          <div class="text-center">
            <h2 class="mt-6 text-3xl font-extrabold text-gray-900">
              Set new password
            </h2>
            <p class="mt-2 text-sm text-gray-600">
              Create a strong password for your account
            </p>
          </div>
        </div>

        <div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            
            {error && (
              <div class="error-message">
                <strong>Error:</strong> {error}
              </div>
            )}
            
            {message && (
              <div class="success-message">
                <strong>Success:</strong> {message}
              </div>
            )}

            <form 
              class="space-y-6" 
              method="post" 
              action="/app/reset-password"
              x-data="resetPasswordForm()"
              novalidate
            >
              <input type="hidden" name="csrf_token" value={csrf_token} />
              <input type="hidden" name="token" value={token} />

              <div>
                <label for="password" class="block text-sm font-medium text-gray-700">
                  New Password
                </label>
                <div class="mt-1">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autocomplete="new-password"
                    required
                    x-model="password"
                    x-on:input="validatePassword()"
                    class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Enter your new password"
                  />
                </div>
              </div>

              <div>
                <label for="confirmPassword" class="block text-sm font-medium text-gray-700">
                  Confirm New Password
                </label>
                <div class="mt-1">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autocomplete="new-password"
                    required
                    x-model="confirmPassword"
                    x-on:input="validatePassword()"
                    class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Confirm your new password"
                  />
                  <div x-show="confirmPasswordError" class="mt-2 text-sm text-red-600" x-text="confirmPasswordError"></div>
                </div>
              </div>

              <div class="password-requirements">
                <h3 class="text-sm font-medium text-gray-900 mb-2">Password Requirements:</h3>
                <ul class="text-sm space-y-1">
                  <li class="flex items-center">
                    <span x-class="requirements.length ? 'requirement-met' : 'requirement-not-met'">
                      <svg class="w-4 h-4 inline mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                      </svg>
                    </span>
                    At least 12 characters
                  </li>
                  <li class="flex items-center">
                    <span x-class="requirements.uppercase ? 'requirement-met' : 'requirement-not-met'">
                      <svg class="w-4 h-4 inline mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                      </svg>
                    </span>
                    At least one uppercase letter
                  </li>
                  <li class="flex items-center">
                    <span x-class="requirements.lowercase ? 'requirement-met' : 'requirement-not-met'">
                      <svg class="w-4 h-4 inline mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                      </svg>
                    </span>
                    At least one lowercase letter
                  </li>
                  <li class="flex items-center">
                    <span x-class="requirements.number ? 'requirement-met' : 'requirement-not-met'">
                      <svg class="w-4 h-4 inline mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                      </svg>
                    </span>
                    At least one number
                  </li>
                  <li class="flex items-center">
                    <span x-class="requirements.special ? 'requirement-met' : 'requirement-not-met'">
                      <svg class="w-4 h-4 inline mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                      </svg>
                    </span>
                    At least one special character
                  </li>
                </ul>
              </div>

              <div>
                <button
                  type="submit"
                  x-bind:disabled="!isFormValid"
                  x-bind:class="isFormValid ? 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500' : 'bg-gray-400 cursor-not-allowed'"
                  class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200"
                >
                  <span class="absolute left-0 inset-y-0 flex items-center pl-3">
                    <svg class="h-5 w-5 text-indigo-500 group-hover:text-indigo-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" />
                    </svg>
                  </span>
                  Reset Password
                </button>
              </div>

              <div class="text-sm text-center space-y-2">
                <a href="/app/login" class="font-medium text-indigo-600 hover:text-indigo-500">
                  Back to Sign In
                </a>
              </div>
            </form>
          </div>
        </div>

        <script>{`
          function resetPasswordForm() {
            return {
              password: '',
              confirmPassword: '',
              confirmPasswordError: '',
              requirements: {
                length: false,
                uppercase: false,
                lowercase: false,
                number: false,
                special: false
              },
              
              validatePassword() {
                this.checkPasswordRequirements();
                this.checkPasswordMatch();
              },
              
              checkPasswordRequirements() {
                const password = this.password;
                this.requirements = {
                  length: password.length >= 12,
                  uppercase: /[A-Z]/.test(password),
                  lowercase: /[a-z]/.test(password),
                  number: /[0-9]/.test(password),
                  special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
                };
              },
              
              checkPasswordMatch() {
                if (this.confirmPassword && this.password !== this.confirmPassword) {
                  this.confirmPasswordError = 'Passwords do not match';
                } else {
                  this.confirmPasswordError = '';
                }
              },
              
              get isFormValid() {
                return this.password && 
                       this.confirmPassword && 
                       !this.confirmPasswordError &&
                       Object.values(this.requirements).every(req => req === true);
              }
            }
          }
        `}</script>
      </body>
    </html>
  )
}