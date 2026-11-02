import * as CookieConsent from '../src/index';
import fullConfig from './config/full-config';

const createConfig = () => ({
    ...fullConfig,
    mode: 'opt-in',
    autoShow: false,
    hideFromBots: false,
    cookie: {
        name: 'cc_execution_regression',
        domain: '',
        secure: false
    },
    categories: {
        necessary: { enabled: true, readOnly: true },
        analytics: { enabled: false },
        marketing: { enabled: false }
    }
});

// Recreate dormant tags as well as page-local counters on a simulated reload.
// Real script bodies must execute; accepted-category flags alone are not proof.
const createPage = () => {
    window.__consentScriptRuns = { analytics: 0, marketing: 0 };
    document.body.innerHTML = `
        <script type="text/plain" data-category="analytics">window.__consentScriptRuns.analytics += 1;</script>
        <script type="text/plain" data-category="marketing">window.__consentScriptRuns.marketing += 1;</script>
    `;
};

const expectRuns = (analytics, marketing) => {
    expect(window.__consentScriptRuns).toEqual({ analytics, marketing });
};

describe('Opt-in script execution', () => {
    beforeEach(() => {
        CookieConsent.reset(true);
        createPage();
    });

    afterEach(() => {
        CookieConsent.reset(true);
        document.body.innerHTML = '';
        delete window.__consentScriptRuns;
    });

    it('Should not execute analytics or marketing before consent or after rejection', async () => {
        await CookieConsent.run(createConfig());
        expectRuns(0, 0);

        CookieConsent.acceptCategory([]);
        expect(CookieConsent.validConsent()).toBe(true);
        expectRuns(0, 0);

        CookieConsent.showPreferences();
        expect(document.body.classList.contains('show--preferences')).toBe(true);
        expectRuns(0, 0);
    });

    it.each(['analytics', 'marketing'])('Should execute only the selected %s script once', async (category) => {
        await CookieConsent.run(createConfig());
        expectRuns(0, 0);

        CookieConsent.acceptCategory(category);
        expectRuns(category === 'analytics' ? 1 : 0, category === 'marketing' ? 1 : 0);
        expect(new Set(CookieConsent.getUserPreferences().acceptedCategories)).toEqual(new Set(['necessary', category]));

        CookieConsent.acceptCategory(category);
        CookieConsent.showPreferences();
        expectRuns(category === 'analytics' ? 1 : 0, category === 'marketing' ? 1 : 0);
    });

    it('Should not reactivate withdrawn scripts after a simulated reload', async () => {
        await CookieConsent.run(createConfig());
        CookieConsent.acceptCategory('all');
        expectRuns(1, 1);

        CookieConsent.acceptCategory([]);
        expect(CookieConsent.getUserPreferences().acceptedCategories).toEqual(['necessary']);
        // Withdrawal cannot undo code already run on the current page.
        expectRuns(1, 1);

        const savedChoice = document.cookie;
        CookieConsent.reset(false);
        expect(document.cookie).toBe(savedChoice);
        createPage();
        await CookieConsent.run(createConfig());

        expect(CookieConsent.validConsent()).toBe(true);
        expect(CookieConsent.getUserPreferences().acceptedCategories).toEqual(['necessary']);
        expectRuns(0, 0);
        CookieConsent.showPreferences();
        expectRuns(0, 0);
    });

    it('Should retain the stored selection with reset(false) and execute only it on reload', async () => {
        await CookieConsent.run(createConfig());
        CookieConsent.acceptCategory('analytics');
        expectRuns(1, 0);
        const savedCookie = CookieConsent.getCookie();
        const savedChoice = document.cookie;

        CookieConsent.reset(false);
        expect(document.cookie).toBe(savedChoice);
        expectRuns(1, 0);
        createPage();
        await CookieConsent.run(createConfig());

        expect(CookieConsent.validConsent()).toBe(true);
        expect(CookieConsent.getCookie()).toEqual(savedCookie);
        expect(new Set(CookieConsent.getUserPreferences().acceptedCategories)).toEqual(new Set(['necessary', 'analytics']));
        expectRuns(1, 0);
    });
});
