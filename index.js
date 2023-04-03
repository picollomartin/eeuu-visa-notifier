const puppeteer = require('puppeteer');
const TelegramBot = require('node-telegram-bot-api');
const { DateTime } = require('luxon');
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const MAX_YEAR_CHECK = process.env.MAX_YEAR_CHECK || 2024;
const APPOINTMENT_ID = process.env.APPOINTMENT_ID;
const SHOW_BROWSER = !!process.env.SHOW_BROWSER;
const USER = process.env.USER;
const PASSWORD = process.env.PASSWORD;
const RESCHEDULE = !!process.env.RESCHEDULE || true;
const MIN_CONSULAR_APPOINTMENT_DATE = process.env.MIN_CONSULAR_APPOINTMENT_DATE || "2023-04-21"
const bot = new TelegramBot(BOT_TOKEN, {polling: false});

function parseRawDate(rawDateText) {
    const dateAndMonthRaw = rawDateText.split(":")[1].split(",")
    const formatted = DateTime.fromFormat(`${dateAndMonthRaw[0]}${dateAndMonthRaw[1]}`.trim(), "d LLLL yyyy", { locale: "es-ar" })
    if (!formatted.isValid) {
        throw new Error("Error parsing date "+rawDateText+" "+formatted.invalidReason)
    }
    return formatted
}

async function getConsularAppointmentDate(page) {
    const consulateAppContainer = await page.$(".consular-appt")
    const consulateAppRawText = await page.evaluate(consulateAppContainer => consulateAppContainer.textContent, consulateAppContainer);
    return parseRawDate(consulateAppRawText)
}

async function getCasAppointmentDate(page) {
    const casAppContainer = await page.$(".asc-appt")
    const casAppRawText = await page.evaluate(casAppContainer => casAppContainer.textContent, casAppContainer);
    return parseRawDate(casAppRawText)
}

async function getDateCandidate(page, skipDates) {
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
        dateCandidate = await page.evaluate(async skipDates => {
            const getISODateFromElement = (element) => {
                const day = element.querySelector("a").textContent.padStart(2, '0')
                const month = `${parseInt(element.getAttribute("data-month"))+1}`.padStart(2, '0')
                const year = element.getAttribute("data-year")
                return year+"-"+month+"-"+day
            }
            const selectedElement = Array.from(document.querySelectorAll("#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group-first > table > tbody td"))
                .find(e => {
                    return !!e.getAttribute("data-handler") && !skipDates.includes(getISODateFromElement(e))
                })
                if (!!selectedElement) {
                    await selectedElement.click()
                    return getISODateFromElement(selectedElement)
                }
            return false
        }, skipDates)
        if (!!dateCandidate) {
            return DateTime.fromISO(dateCandidate)
        }
        await page.click(".ui-datepicker-next")
    }

    return dateCandidate
}

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
        await page.click('#sign_in_form > p:nth-child(7) > input');
        const minConsularAppointmentDate = DateTime.fromISO(MIN_CONSULAR_APPOINTMENT_DATE)

        console.log('login success')
        await sleep(3000)
        const consularAppointmentDate = await getConsularAppointmentDate(page)
        console.log("Actual consular date: "+ consularAppointmentDate.toISODate())
        const casAppointmentDate = await getCasAppointmentDate(page)
        console.log("Actual CAS date: "+ casAppointmentDate.toISODate())

        await page.goto(`https://ais.usvisa-info.com/es-ar/niv/schedule/${APPOINTMENT_ID}/appointment`)
        await sleep(2000)
        await page.select("#appointments_consulate_appointment_facility_id", "28")
        await sleep(2000)
        const skipConsularDates = []
        const skipCASDates = []
        while (true) {
            await page.click("#appointments_consulate_appointment_date")
            await sleep(2000)

            const dateConsularCandidate = await getDateCandidate(page, skipConsularDates)
            const dateConsularFound = !!dateConsularCandidate
            if (!dateConsularFound) {
                console.log("No consular date found")
                break
            }
            console.log("New consular date found: "+ dateConsularCandidate.toISODate())

            if (dateConsularCandidate >= consularAppointmentDate) {
                console.log("New consular date is not worthy because is after actual consular appointment")
                break
            }

            if (dateConsularCandidate <= minConsularAppointmentDate) {
                console.log("New consular date is not worthy because is before min consular appointment")
                skipConsularDates.push(dateConsularCandidate.toISODate())
                continue
            }
            await sleep(2000)
            const consularDateHour = await page.evaluate(() => {
                const options = Array.from(document.querySelectorAll('#appointments_consulate_appointment_time option'));
                if (options.length > 0) {
                    const hourSelected = options[1]
                    hourSelected.selected = true;
                    return hourSelected.value
                }
                return false
            });
            const consulateDateHourFound = !!consularDateHour
            if (!consulateDateHourFound) {
                console.log("Consulate hour not found for consular date: "+dateConsularCandidate.toISODate())
                skipConsularDates.push(dateConsularCandidate.toISODate())
                continue
            }

            console.log("Consular date hour found: "+consularDateHour)

            await page.select('#appointments_consulate_appointment_time', consularDateHour)
            await sleep(2000)

            const casEnabled = await page.evaluate(() => {
                const disabledAttr = document.querySelector("#appointments_asc_appointment_facility_id").getAttribute("disabled")
                return disabledAttr !== "disabled"
            });
            if (!casEnabled) {
                console.log("CAS is not available for that consular date: "+dateConsularCandidate.toISODate())
                skipConsularDates.push(dateConsularCandidate.toISODate())
                continue
            }
            await page.click("#appointments_asc_appointment_date")
            await sleep(2000)

            const dateCASCandidate = await getDateCandidate(page, skipCASDates)
            const dateCASCandidateFound = !!dateCASCandidate
            if (!dateCASCandidateFound) {
                console.log("No CAS date found")
                return
            }

            console.log("Consular date found: "+dateCASCandidate)

            await sleep(2000)

            const casDateHour = await page.evaluate(() => {
                const options = Array.from(document.querySelectorAll('#appointments_consulate_appointment_time option'));
                if (options.length > 0) {
                    const hourSelected = options[1]
                    hourSelected.selected = true;
                    return hourSelected.value
                }
                return false
            });
            const casDateHourFound = !!casDateHour
            if (!casDateHourFound) {
                console.log("CAS hour not found for CAS date: "+dateCASCandidateFound.toISODate())
                skipConsularDates.push(dateConsularCandidate.toISODate())
                skipCASDates.push(dateCASCandidateFound.toISODate())
                continue
            }

            console.log("CAS date hour found: "+casDateHour)

            if (RESCHEDULE) {
                await page.click("#appointments_submit")
                const confirmNewDateSelector = "body > div.reveal-overlay > div > div > a.button.alert"
                await page.waitForSelector(confirmNewDateSelector, {timeout: 2000})
                await page.click(confirmNewDateSelector)
            }

            await bot.sendMessage(CHAT_ID, "📅 Turno de visa reprogramado 📅 \n Fecha consulado: "+dateConsularCandidate.toISODate() + " \n Fecha CAS: "+dateCASCandidate.toISODate())
            break
        }

        await page.close()
        process.exit(0)


    } catch (e) {
        console.error('fail check visa date', e)
        process.exit(1)
    }
})();

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
