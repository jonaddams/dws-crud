# Deployment Guide - Nutrient Document Engine CRUD App

This guide covers deploying the Nutrient Document Engine CRUD application to Vercel.

## Prerequisites

Before deploying, ensure you have:

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **GitHub Repository**: Code pushed to a GitHub repository
3. **PostgreSQL Database**: A hosted PostgreSQL database (recommended: Vercel Postgres, Neon, or PlanetScale)
4. **Nutrient API Key**: Valid API key from [Nutrient Dashboard](https://dashboard.nutrient.io/)
5. **Google OAuth App**: OAuth credentials for authentication

## Environment Variables

Set up the following environment variables in Vercel:

### Required Environment Variables

```bash
# Nutrient API Configuration
NUTRIENT_API_KEY=your_nutrient_api_key_here
NUTRIENT_API_BASE_URL=https://api.nutrient.io/viewer/documents
NUTRIENT_VIEWER_VERSION=1.7.0

# Database
DATABASE_URL=postgresql://username:password@host:port/database_name

# NextAuth.js
NEXTAUTH_URL=https://your-app-name.vercel.app
NEXTAUTH_SECRET=your_nextauth_secret_here

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

### Generating Secrets

**NEXTAUTH_SECRET**: Generate a secure random string:
```bash
openssl rand -base64 32
```

**NUTRIENT_API_KEY**:
1. Visit [Nutrient Dashboard](https://dashboard.nutrient.io/)
2. Create a new API key with viewer permissions
3. Copy the key (starts with `pdf_live_`)

## Database Setup

### Option 1: Vercel Postgres (Recommended)

1. Go to your Vercel dashboard
2. Select your project
3. Go to the "Storage" tab
4. Click "Create Database" → "Postgres"
5. Copy the `DATABASE_URL` to your environment variables

### Option 2: External Database

Use any PostgreSQL provider (Neon, Supabase, PlanetScale, etc.) and set the `DATABASE_URL` accordingly.

### Running Migrations

After setting up your database:

1. Install Vercel CLI: `npm i -g vercel`
2. Link your project: `vercel link`
3. Pull environment variables: `vercel env pull .env.local`
4. Run migrations locally: `pnpm prisma migrate deploy`
5. Push schema: `pnpm prisma db push`

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the Google+ API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Set application type to "Web application"
6. Add authorized redirect URIs:
   - `https://your-app-name.vercel.app/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (for development)
7. Copy Client ID and Client Secret to environment variables

## Vercel Deployment Steps

### Method 1: GitHub Integration (Recommended)

1. **Push code to GitHub**:
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

2. **Import to Vercel**:
   - Go to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Click "New Project"
   - Import your GitHub repository
   - Configure project settings:
     - **Framework Preset**: Next.js
     - **Root Directory**: `./` (if code is in root)
     - **Build Command**: `pnpm run build`
     - **Install Command**: `pnpm install`

3. **Set Environment Variables**:
   - In project settings, go to "Environment Variables"
   - Add all required variables listed above
   - Make sure to set them for Production, Preview, and Development

4. **Deploy**:
   - Click "Deploy"
   - Wait for build to complete

### Method 2: Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel --prod
   ```

## Post-Deployment Setup

### 1. Database Initialization

After first deployment, initialize your database:

```bash
# Using Vercel CLI with environment variables
vercel env pull .env.local
pnpm prisma migrate deploy
pnpm prisma generate
```

### 2. Test the Application

1. Visit your deployed URL
2. Test Google OAuth login
3. Upload a test document
4. Verify document viewing works
5. Test document deletion

### 3. Domain Configuration (Optional)

If using a custom domain:
1. Go to project settings → "Domains"
2. Add your custom domain
3. Update `NEXTAUTH_URL` environment variable
4. Update Google OAuth redirect URIs

## Troubleshooting

### Common Issues

**Build Failures**:
- Check all environment variables are set
- Ensure `DATABASE_URL` is correctly formatted
- Verify all dependencies are in `package.json`

**Authentication Issues**:
- Verify `NEXTAUTH_URL` matches your deployed URL
- Check Google OAuth redirect URIs
- Ensure `NEXTAUTH_SECRET` is set

**Database Connection Issues**:
- Verify `DATABASE_URL` format: `postgresql://user:pass@host:port/db`
- Check database is accessible from Vercel
- Run migrations: `pnpm prisma migrate deploy`

**Nutrient API Issues**:
- Verify `NUTRIENT_API_KEY` is valid and has correct permissions
- Check API key quotas and limits
- Ensure `NUTRIENT_VIEWER_VERSION` matches available version

### Debug Mode

Enable debug logging by adding:
```bash
NEXTAUTH_DEBUG=true
```

### Logs

View deployment and runtime logs:
- Vercel Dashboard → Project → Functions tab
- Or use CLI: `vercel logs`

## Performance Optimization

### Build Optimization

The app includes several optimizations:
- **Turbopack** for faster development builds
- **Static generation** for auth pages
- **Dynamic imports** for large components
- **Image optimization** through Next.js

### Monitoring

Consider adding:
- **Vercel Analytics** for performance monitoring
- **Sentry** for error tracking
- **Vercel Speed Insights** for Core Web Vitals

## Security Considerations

### Environment Variables
- Never commit `.env` files to git
- Use Vercel's environment variable encryption
- Rotate secrets regularly

### Authentication
- OAuth is restricted to `nutrient.io` and `pspdfkit.com` domains
- Sessions use secure cookies
- CSRF protection enabled

### API Security
- All API routes require authentication
- Role-based access control implemented
- Input validation on all endpoints

## Maintenance

### Updates
- Dependencies are pinned to specific versions
- Update `NUTRIENT_VIEWER_VERSION` when new versions are available
- Test in preview deployments before promoting to production

### Backups
- Database backups handled by your PostgreSQL provider
- Consider regular exports of critical data

### Monitoring
- Set up uptime monitoring
- Monitor API usage and quotas
- Track error rates and performance metrics

## Support

For deployment issues:
- Check [Vercel Documentation](https://vercel.com/docs)
- Review [Next.js Deployment Guide](https://nextjs.org/docs/deployment)
- Contact Nutrient support for API-related issues

## Sample Commands Reference

```bash
# Local development
pnpm dev

# Production build test
pnpm run build

# Database operations
pnpm prisma migrate deploy
pnpm prisma generate
pnpm prisma studio

# Linting and formatting
pnpm run biome:check
pnpm run biome:fix

# Vercel operations
vercel login
vercel link
vercel env pull
vercel logs
vercel --prod
```

---

**Next Steps After Deployment:**
1. Test all functionality in production
2. Set up monitoring and alerts
3. Configure custom domain (if needed)
4. Document API usage for your team
5. Set up automated backups