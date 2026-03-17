export type Locale = 'en' | 'hi';

const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Navigation
    'nav.editTrip': 'Edit Trip',
    'nav.route': 'Route',
    'nav.settings': 'Settings',
    'nav.signOut': 'Sign Out',
    'nav.myTrips': 'My Trips',

    // Trip planning
    'plan.from': 'From',
    'plan.destinations': 'Destinations',
    'plan.departureDate': 'Departure Date',
    'plan.travelers': 'Travelers',
    'plan.adults': 'Adults',
    'plan.children': 'Children',
    'plan.infants': 'Infants',
    'plan.roundTrip': 'Round Trip',
    'plan.oneWay': 'One Way',
    'plan.addDestination': 'Add a destination city or place...',
    'plan.optimizeRoute': 'Optimize & Continue',
    'plan.aiSuggest': 'AI Suggest',

    // Route page
    'route.tripOverview': 'Trip Overview',
    'route.tripEstimate': 'Trip Estimate',
    'route.flights': 'Flights',
    'route.trains': 'Trains',
    'route.hotels': 'Hotels',
    'route.estimatedTotal': 'Estimated Total',
    'route.deepPlan': 'Deep Plan',
    'route.downloadPdf': 'Download PDF',
    'route.addToCalendar': 'Add to Calendar',
    'route.packingList': 'Packing List',
    'route.shareTrip': 'Share Trip',
    'route.change': 'Change',
    'route.book': 'Book',
    'route.autoSaved': 'Auto-saved',
    'route.saving': 'Saving in a moment...',
    'route.priceDisclaimer': 'Prices are estimates and may vary at booking',
    'route.nights': 'nights',
    'route.pax': 'pax',
    'route.cities': 'cities',

    // Auth
    'auth.signIn': 'Sign In',
    'auth.signUp': 'Sign Up',
    'auth.email': 'Email address',
    'auth.password': 'Password',
    'auth.forgotPassword': 'Forgot password?',
    'auth.noAccount': "Don't have an account?",
    'auth.hasAccount': 'Already have an account?',
    'auth.continueWith': 'or continue with',

    // My trips
    'trips.newTrip': '+ New Trip',
    'trips.aiPlan': 'AI Plan',
    'trips.noTrips': 'No trips yet',
    'trips.startPlanning': 'Start planning your first adventure!',
    'trips.templates': 'Start from a template',

    // Settings
    'settings.title': 'Settings',
    'settings.profile': 'Profile',
    'settings.security': 'Security',
    'settings.dangerZone': 'Danger Zone',
    'settings.save': 'Save Changes',
    'settings.changePassword': 'Change Password',
    'settings.deleteAccount': 'Delete Account',
    'settings.language': 'Language',
    'settings.languageDesc': 'Choose your preferred language',

    // Common
    'common.loading': 'Loading...',
    'common.error': 'Something went wrong',
    'common.tryAgain': 'Try again',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.copy': 'Copy',
    'common.copied': 'Copied!',
  },
  hi: {
    // Navigation
    'nav.editTrip': 'यात्रा संपादित करें',
    'nav.route': 'मार्ग',
    'nav.settings': 'सेटिंग्स',
    'nav.signOut': 'साइन आउट',
    'nav.myTrips': 'मेरी यात्राएं',

    // Trip planning
    'plan.from': 'कहाँ से',
    'plan.destinations': 'गंतव्य',
    'plan.departureDate': 'प्रस्थान तिथि',
    'plan.travelers': 'यात्री',
    'plan.adults': 'वयस्क',
    'plan.children': 'बच्चे',
    'plan.infants': 'शिशु',
    'plan.roundTrip': 'राउंड ट्रिप',
    'plan.oneWay': 'एक तरफ़',
    'plan.addDestination': 'गंतव्य शहर जोड़ें...',
    'plan.optimizeRoute': 'ऑप्टिमाइज़ करें और जारी रखें',
    'plan.aiSuggest': 'AI सुझाव',

    // Route page
    'route.tripOverview': 'यात्रा अवलोकन',
    'route.tripEstimate': 'यात्रा अनुमान',
    'route.flights': 'उड़ानें',
    'route.trains': 'ट्रेनें',
    'route.hotels': 'होटल',
    'route.estimatedTotal': 'अनुमानित कुल',
    'route.deepPlan': 'विस्तृत योजना',
    'route.downloadPdf': 'PDF डाउनलोड',
    'route.addToCalendar': 'कैलेंडर में जोड़ें',
    'route.packingList': 'पैकिंग सूची',
    'route.shareTrip': 'यात्रा शेयर करें',
    'route.change': 'बदलें',
    'route.book': 'बुक करें',
    'route.autoSaved': 'ऑटो-सेव हो गया',
    'route.saving': 'थोड़ी देर में सेव हो रहा है...',
    'route.priceDisclaimer': 'कीमतें अनुमानित हैं और बुकिंग पर भिन्न हो सकती हैं',
    'route.nights': 'रातें',
    'route.pax': 'यात्री',
    'route.cities': 'शहर',

    // Auth
    'auth.signIn': 'साइन इन',
    'auth.signUp': 'साइन अप',
    'auth.email': 'ईमेल पता',
    'auth.password': 'पासवर्ड',
    'auth.forgotPassword': 'पासवर्ड भूल गए?',
    'auth.noAccount': 'खाता नहीं है?',
    'auth.hasAccount': 'पहले से खाता है?',
    'auth.continueWith': 'या इसके साथ जारी रखें',

    // My trips
    'trips.newTrip': '+ नई यात्रा',
    'trips.aiPlan': 'AI प्लान',
    'trips.noTrips': 'अभी तक कोई यात्रा नहीं',
    'trips.startPlanning': 'अपनी पहली यात्रा की योजना बनाना शुरू करें!',
    'trips.templates': 'टेम्पलेट से शुरू करें',

    // Settings
    'settings.title': 'सेटिंग्स',
    'settings.profile': 'प्रोफ़ाइल',
    'settings.security': 'सुरक्षा',
    'settings.dangerZone': 'खतरनाक क्षेत्र',
    'settings.save': 'परिवर्तन सहेजें',
    'settings.changePassword': 'पासवर्ड बदलें',
    'settings.deleteAccount': 'खाता हटाएं',
    'settings.language': 'भाषा',
    'settings.languageDesc': 'अपनी पसंदीदा भाषा चुनें',

    // Common
    'common.loading': 'लोड हो रहा है...',
    'common.error': 'कुछ गलत हो गया',
    'common.tryAgain': 'फिर से कोशिश करें',
    'common.cancel': 'रद्द करें',
    'common.close': 'बंद करें',
    'common.copy': 'कॉपी',
    'common.copied': 'कॉपी हो गया!',
  },
};

export function t(key: string, locale: Locale = 'en'): string {
  return translations[locale]?.[key] || translations.en[key] || key;
}

export const LOCALES: { code: Locale; name: string; nativeName: string }[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
];
