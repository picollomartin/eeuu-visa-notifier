const puppeteer = require('puppeteer');
const TelegramBot = require('node-telegram-bot-api');
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const MAX_YEAR_CHECK = process.env.MAX_YEAR_CHECK || 2024;
const APPOINTMENT_ID = process.env.APPOINTMENT_ID;
const SHOW_BROWSER = !!process.env.SHOW_BROWSER;
const USER = process.env.USER;
const PASSWORD = process.env.PASSWORD;
const bot = new TelegramBot(BOT_TOKEN, {polling: false});

(async() => {
    try {
        console.log('start check')
        const browser = await puppeteer.launch({args: ['--no-sandbox'], headless: !SHOW_BROWSER});
        const page = (await browser.pages())[0];
        page.setDefaultNavigationTimeout(0);
        await page.goto('https://ais.usvisa-info.com/es-ar/niv/users/sign_in');
        await page.type('#user_email', `${USER}`);
        await page.type('#user_password', `${PASSWORD}`);
        await page.click('#policy_confirmed');
        await page.click('#new_user > p:nth-child(8) > input');
        console.log('login success')
        await sleep(2000)
        await page.goto(`https://ais.usvisa-info.com/es-ar/niv/schedule/${APPOINTMENT_ID}/appointment`)
        await sleep(2000)
        await page.select("#appointments_consulate_appointment_facility_id", "28")
        await sleep(2000)
        await page.click("#appointments_consulate_appointment_date")
        await sleep(2000)
        let dateCandidate
        while (true) {
            const monthComponent = await page.$("span.ui-datepicker-month")
            const month = await page.evaluate(monthComponent => monthComponent.textContent, monthComponent);
            const dateComponent = await page.$("span.ui-datepicker-year")
            const year = await page.evaluate(dateComponent => dateComponent.textContent, dateComponent);
            const parsedYear = parseInt(year)
            if (parsedYear > MAX_YEAR_CHECK) {
                console.log("max year check reached")
                break
            }
            console.log("checking month/year: "+month+"/"+year)
            dateCandidate = await page.evaluate(() => {
                const selectedElement = Array.from(document.querySelectorAll("#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group-first > table > tbody td")).find(e => !!e.getAttribute("data-handler"))
                if (!!selectedElement) {
                    const day = selectedElement.querySelector("a").textContent
                    const month = parseInt(selectedElement.getAttribute("data-month"))+1
                    const year = selectedElement.getAttribute("data-year")
                    return day+"/"+month+"/"+year
                }
                return false
            })
            if (!!dateCandidate) {
                console.log("found date candidate")
                console.log(dateCandidate)
                break
            }
            console.log("not found")
            await page.click(".ui-datepicker-next")
            console.log("next")
        }
        console.log("finish check")
        await page.close()
        if (!!dateCandidate) {
            await bot.sendMessage(CHAT_ID, "📅 Turno de visa disponible 📅 \n "+dateCandidate)
        }
        process.exit(0)

    } catch (e) {
        console.error('fail check visa date', e)
        // process.exit(1)
    }
})();

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
