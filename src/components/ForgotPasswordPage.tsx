import { FC } from 'hono/jsx'

interface ForgotPasswordPageProps {
  error?: string
  message?: string
  csrf_token: string
}

export const ForgotPasswordPage: FC<ForgotPasswordPageProps> = ({ error, message, csrf_token }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Forgot Password - Conversionware</title>
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
          .info-message {
            background-color: #eff6ff;
            border: 1px solid #bfdbfe;
            color: #1e40af;
            padding: 0.75rem;
            border-radius: 0.375rem;
            margin-bottom: 1rem;
          }
        `}</style>
      </head>
      <body class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div class="sm:mx-auto sm:w-full sm:max-w-md">
          <div class="text-center">
            <h2 class="mt-6 text-3xl font-extrabold text-gray-900">
              Reset your password
            </h2>
            <p class="mt-2 text-sm text-gray-600">
              Enter your email address and we'll send you a reset link
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

            <div class="info-message">
              <strong>Security Notice:</strong> If the email address is registered, you'll receive reset instructions within 5-10 minutes. Please check your spam folder.
            </div>

            <form 
              class="space-y-6" 
              method="post" 
              action="/app/forgot-password"
              x-data="forgotPasswordForm()"
              novalidate
            >
              <input type="hidden" name="csrf_token" value={csrf_token} />

              <div>
                <label for="email" class="block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <div class="mt-1">
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autocomplete="email"
                    required
                    x-model="email"
                    x-on:input="validateEmail()"
                    class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Enter your email address"
                  />
                  <div x-show="emailError" class="mt-2 text-sm text-red-600" x-text="emailError"></div>
                </div>
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
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                    </svg>
                  </span>
                  Send Reset Link
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
          function forgotPasswordForm() {
            return {
              email: '',
              emailError: '',
              
              validateEmail() {
                const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/
                
                if (!this.email) {
                  this.emailError = 'Email address is required'
                } else if (this.email.length > 254) {
                  this.emailError = 'Email address is too long'
                } else if (!emailRegex.test(this.email)) {
                  this.emailError = 'Please enter a valid email address'
                } else {
                  this.emailError = ''
                }
              },
              
              get isFormValid() {
                return this.email && !this.emailError
              }
            }
          }
        `}</script>
      </body>
    </html>
  )
}