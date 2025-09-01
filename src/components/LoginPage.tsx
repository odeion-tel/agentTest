import { FC } from 'hono/jsx'

interface LoginPageProps {
  error?: string
  message?: string
  csrf_token: string
  redirect_to?: string
}

export const LoginPage: FC<LoginPageProps> = ({ error, message, csrf_token, redirect_to }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Login - Conversionware</title>
        <script src="https://unpkg.com/htmx.org@2.0.2"></script>
        <script src="https://unpkg.com/alpinejs@3.14.1/dist/cdn.min.js" defer></script>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>{`
          .password-requirement {
            font-size: 0.875rem;
            margin-top: 0.25rem;
          }
          .password-requirement.valid {
            color: #22c55e;
          }
          .password-requirement.invalid {
            color: #ef4444;
          }
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
        `}</style>
      </head>
      <body class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div class="sm:mx-auto sm:w-full sm:max-w-md">
          <div class="text-center">
            <h2 class="mt-6 text-3xl font-extrabold text-gray-900">
              Sign in to your account
            </h2>
            <p class="mt-2 text-sm text-gray-600">
              Access the Conversionware admin dashboard
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
              action="/app/login"
              x-data="loginForm()"
              novalidate
            >
              <input type="hidden" name="csrf_token" value={csrf_token} />
              {redirect_to && (
                <input type="hidden" name="redirect_to" value={redirect_to} />
              )}

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
                  <div x-show="emailError" class="password-requirement invalid" x-text="emailError"></div>
                </div>
              </div>

              <div>
                <label for="password" class="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div class="mt-1">
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autocomplete="current-password"
                    required
                    x-model="password"
                    x-on:input="validatePassword()"
                    class="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Enter your password"
                  />
                  
                  {/* OWASP Password Requirements Display */}
                  <div class="mt-2 space-y-1" x-show="password.length > 0">
                    <div class="text-sm font-medium text-gray-700 mb-2">Password Requirements:</div>
                    
                    <div 
                      class="password-requirement"
                      x-bind:class="requirements.length ? 'valid' : 'invalid'"
                    >
                      ✓ At least 8 characters (minimum length)
                    </div>
                    
                    <div 
                      class="password-requirement"
                      x-bind:class="requirements.maxLength ? 'valid' : 'invalid'"
                    >
                      ✓ Maximum 128 characters
                    </div>
                    
                    <div 
                      class="password-requirement"
                      x-bind:class="requirements.uppercase ? 'valid' : 'invalid'"
                    >
                      ✓ At least one uppercase letter (A-Z)
                    </div>
                    
                    <div 
                      class="password-requirement"
                      x-bind:class="requirements.lowercase ? 'valid' : 'invalid'"
                    >
                      ✓ At least one lowercase letter (a-z)
                    </div>
                    
                    <div 
                      class="password-requirement"
                      x-bind:class="requirements.number ? 'valid' : 'invalid'"
                    >
                      ✓ At least one number (0-9)
                    </div>
                    
                    <div 
                      class="password-requirement"
                      x-bind:class="requirements.special ? 'valid' : 'invalid'"
                    >
                      ✓ At least one special character (!@#$%^&*(),.?\":{}|&lt;&gt;)
                    </div>
                  </div>

                  <div x-show="passwordError" class="password-requirement invalid mt-2" x-text="passwordError"></div>
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
                      <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" />
                    </svg>
                  </span>
                  Sign in
                </button>
              </div>

              <div class="text-sm text-center">
                <a href="/app/forgot-password" class="font-medium text-indigo-600 hover:text-indigo-500">
                  Forgot your password?
                </a>
              </div>
            </form>
          </div>
        </div>

        <script>{`
          function loginForm() {
            return {
              email: '',
              password: '',
              emailError: '',
              passwordError: '',
              requirements: {
                length: false,
                maxLength: true,
                uppercase: false,
                lowercase: false, 
                number: false,
                special: false
              },
              
              validateEmail() {
                const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/
                
                if (!this.email) {
                  this.emailError = 'Email address is required'
                } else if (!emailRegex.test(this.email)) {
                  this.emailError = 'Please enter a valid email address'
                } else {
                  this.emailError = ''
                }
              },
              
              validatePassword() {
                this.requirements.length = this.password.length >= 8
                this.requirements.maxLength = this.password.length <= 128
                this.requirements.uppercase = /[A-Z]/.test(this.password)
                this.requirements.lowercase = /[a-z]/.test(this.password)
                this.requirements.number = /[0-9]/.test(this.password)
                this.requirements.special = /[!@#$%^&*(),.?":{}|<>]/.test(this.password)
                
                if (!this.password) {
                  this.passwordError = 'Password is required'
                } else if (!this.isPasswordValid) {
                  this.passwordError = 'Password does not meet security requirements'
                } else {
                  this.passwordError = ''
                }
              },
              
              get isPasswordValid() {
                return Object.values(this.requirements).every(req => req === true)
              },
              
              get isFormValid() {
                return this.email && 
                       this.password && 
                       !this.emailError && 
                       !this.passwordError && 
                       this.isPasswordValid
              }
            }
          }
        `}</script>
      </body>
    </html>
  )
}