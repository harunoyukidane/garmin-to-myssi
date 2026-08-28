# Dive Log Transfer

Mobile-first React Native + Expo scaffold for importing Garmin dive logs, assigning SSI dive numbers for a trip, reviewing fields, and exporting SSI-friendly files.

## MVP Flow

1. Enter trip start date, trip end date, and the first SSI dive number.
2. Upload Garmin FIT or CSV exports, or connect an approved Garmin adapter later.
3. Filter dives by trip date range.
4. Normalize Garmin records into the canonical dive model.
5. Assign SSI dive numbers starting from the trip setup value.
6. Review, correct, and export CSV or JSON.

## Project Shape

- `src/screens`: Expo screen components.
- `src/services`: Client-side API and trip draft helpers.
- `shared`: Types, validation, and mapping config shared by app and backend.
- `backend`: Serverless-ready route handlers and domain modules.

## Commands

```bash
npm install
npm run typecheck
npm start
```

## Native Phone App Builds

This project is configured as a native React Native app through Expo. For quick
device testing, run `npm start` and open the project in Expo Go.

For an installable phone build, set a backend URL that the phone can reach and
use an EAS build profile:

```bash
set EXPO_PUBLIC_API_BASE_URL=https://your-api.example.com
npm run build:android
npm run build:ios
```

The Android preview profile creates an installable APK. The iOS preview build
requires an Apple Developer account and device signing through EAS.

The backend files are written as framework-neutral serverless handlers so they can be adapted to Expo API routes, Next.js, Netlify, Vercel, or AWS Lambda.
