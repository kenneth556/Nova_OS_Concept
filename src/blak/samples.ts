/**
 * Sample BLAK programs. They are the App Store catalogue and double as the
 * templates offered by Code Studio, so they also serve as the language's
 * showcase — each one is meant to look like a finished app, not a snippet.
 */

export interface BlakSample {
  slug: string;
  name: string;
  icon: string;
  color: string;
  author: string;
  version: string;
  description: string;
  permissions: string[];
  source: string;
  rating?: number;
  reviews?: number;
}

const HELLO = `app "Hello World" {
    devMode = false
    soundEnabled = true
    performance = 88
    cpuLoad = 34
    memoryUsage = 58
    statusMessage = "System is running at peak performance"

    testNotification() {
        notify "Hello from BLAK! Everything is working smoothly."
        statusMessage = "Notification sent at " + system.time()
    }

    optimizeSystem() {
        cpuLoad = 18
        memoryUsage = 42
        performance = 96
        statusMessage = "Memory flushed & optimized!"
    }

    window "Hello World" {
        size 580, 620
        title "Welcome to NovaOS"

        column {
            gap 14

            row {
                gap 12
                avatar "NOVA", 44
                column {
                    gap 2
                    heading "NovaOS Experience"
                    subtitle "Native BLAK Application Engine · Version 2.0"
                }
                spacer 1
                badge "Online" {
                    color success
                }
            }

            divider

            card {
                column {
                    gap 8
                    row {
                        gap 8
                        badge "SYSTEM HEALTH" {
                            color accent
                        }
                        text statusMessage {
                            color muted
                            text_size 12
                        }
                    }

                    row {
                        gap 16
                        column {
                            gap 4
                            text "Overall Performance" {
                                bold true
                                text_size 13
                            }
                            progress performance, 100
                        }
                        column {
                            gap 4
                            text "CPU Utilization" {
                                bold true
                                text_size 13
                            }
                            progress cpuLoad, 100
                        }
                    }
                }
            }

            card {
                column {
                    gap 10
                    heading "Interactive Controls"
                    subtitle "Modern switches and instant state persistence"

                    toggle "Developer Mode", devMode
                    toggle "System Sounds & Haptics", soundEnabled

                    if devMode {
                        card {
                            column {
                                gap 4
                                badge "DevTools Active" {
                                    color warning
                                }
                                text "AST inspection and live memory monitoring are enabled." {
                                    color muted
                                    text_size 12
                                }
                            }
                        }
                    }
                }
            }

            card {
                column {
                    gap 10
                    heading "Quick Actions"
                    subtitle "Explore native OS capabilities"

                    row {
                        gap 8
                        button "Send Notification" {
                            variant primary
                            testNotification()
                        }

                        button "Optimize" {
                            variant secondary
                            optimizeSystem()
                        }

                        button "Open Studio" {
                            variant ghost
                            open "Code Studio"
                        }
                    }
                }
            }

            row {
                align center
                text "Crafted entirely in BLAK — Declarative, Fast & Elegant" {
                    color muted
                    text_size 11
                    align center
                }
            }
        }
    }
}
`;

const COUNTER = `app "Counter" {
    count = 0
    goal = 50
    stepSize = 1
    boost = false
    history = [
        { label: "Started session", val: 0, time: "Initial" }
    ]

    addCount(amount) {
        multiplier = 1
        if boost {
            multiplier = 2
        }
        delta = amount * multiplier
        count = count + delta
        if count < 0 {
            count = 0
        }
        tag = "+" + string(delta)
        if delta < 0 {
            tag = string(delta)
        }
        add(history, { label: tag, val: count, time: system.time() })
        if count >= goal {
            notify "Goal Reached! Target of " + string(goal) + " completed!"
        }
    }

    resetCounter() {
        count = 0
        history = [
            { label: "Reset counter", val: 0, time: system.time() }
        ]
    }

    window "Counter" {
        size 500, 580
        title "Tally & Counter"

        column {
            gap 14

            row {
                gap 10
                avatar "🔢", 38
                column {
                    gap 2
                    heading "Goal Counter"
                    subtitle "Live state, tally goals & history"
                }
                spacer 1
                if count >= goal {
                    badge "GOAL MET" {
                        color success
                    }
                }
                else {
                    badge "IN PROGRESS" {
                        color accent
                    }
                }
            }

            card {
                column {
                    gap 6
                    align center
                    subtitle "CURRENT TALLY"

                    text count {
                        text_size 64
                        bold true
                        color accent
                        align center
                    }

                    progress count, goal

                    row {
                        gap 8
                        text "Goal: " + string(goal) {
                            color muted
                            text_size 12
                        }
                        text "·" {
                            color muted
                        }
                        text "Remaining: " + string(max(0, goal - count)) {
                            color muted
                            text_size 12
                        }
                    }
                }
            }

            card {
                column {
                    gap 10
                    subtitle "STEP CONTROLS"

                    row {
                        gap 8
                        button "− 10" {
                            variant secondary
                            addCount(-10)
                        }
                        button "− 1" {
                            variant secondary
                            addCount(-1)
                        }
                        button "+ 1" {
                            variant primary
                            addCount(1)
                        }
                        button "+ 5" {
                            variant primary
                            addCount(5)
                        }
                        button "+ 10" {
                            variant primary
                            addCount(10)
                        }
                    }

                    divider

                    row {
                        gap 12
                        toggle "2x Multiplier", boost
                        spacer 1
                        button "Reset All" {
                            variant ghost
                            resetCounter()
                        }
                    }
                }
            }

            card {
                column {
                    gap 8
                    row {
                        heading "Recent Activity"
                        spacer 1
                        badge string(length(history)) + " entries" {
                            color muted
                        }
                    }

                    scrollbox {
                        gap 6
                        max_height 150

                        for entry in history {
                            row {
                                badge entry.label {
                                    color accent
                                }
                                text "Count reached: " + string(entry.val) {
                                    text_size 12
                                }
                                spacer 1
                                text entry.time {
                                    color muted
                                    text_size 11
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
`;

const GREETER = `app "Greeter" {
    permission notifications

    person = ""
    customMessage = ""
    tone = "Friendly"
    isUrgent = false
    notificationHistory = [
        { recipient: "Alex", preview: "Great work on NovaOS 2.0!", time: "10:30 AM" }
    ]

    sendGreeting() {
        if person == "" {
            notify "Please provide a name first."
            return
        }

        prefix = "Hello "
        if tone == "Formal" {
            prefix = "Good day, "
        }
        if tone == "Excited" {
            prefix = "Hey there, awesome "
        }
        if tone == "Cyberpunk" {
            prefix = "Incoming transmission for NetRunner "
        }

        body = prefix + person + "!"
        if customMessage != "" {
            body = body + " — " + customMessage
        }
        if isUrgent {
            body = "[URGENT] " + body
        }

        notify body
        add(notificationHistory, { recipient: person, preview: body, time: system.time() })
        person = ""
        customMessage = ""
    }

    window "Greeter" {
        size 520, 600
        title "Nova Messenger"

        column {
            gap 14

            row {
                gap 10
                avatar "👋", 40
                column {
                    gap 2
                    heading "System Messenger"
                    subtitle "Broadcast real desktop notifications"
                }
            }

            card {
                column {
                    gap 10

                    input person {
                        placeholder "Recipient name (e.g. Kenneth, Sarah)"
                    }

                    input customMessage {
                        placeholder "Optional message note..."
                    }

                    row {
                        gap 12
                        select tone {
                            option "Friendly"
                            option "Formal"
                            option "Excited"
                            option "Cyberpunk"
                        }
                        toggle "High Priority", isUrgent
                    }

                    row {
                        gap 8
                        button "Send Notification" {
                            variant primary
                            sendGreeting()
                        }

                        button "Clear" {
                            variant ghost
                            person = ""
                            customMessage = ""
                        }
                    }
                }
            }

            card {
                column {
                    gap 8
                    row {
                        heading "Transmission Log"
                        spacer 1
                        badge string(length(notificationHistory)) + " sent" {
                            color success
                        }
                    }

                    scrollbox {
                        gap 8
                        max_height 200

                        for item in notificationHistory {
                            card {
                                column {
                                    gap 4
                                    row {
                                        avatar item.recipient, 28
                                        text item.recipient {
                                            bold true
                                            text_size 13
                                        }
                                        spacer 1
                                        text item.time {
                                            color muted
                                            text_size 11
                                        }
                                    }
                                    text item.preview {
                                        color muted
                                        text_size 12
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
`;

const TODO = `app "To-do" {
    permission files

    tasks = [
        { id: 1, title: "Design glassmorphic app store", category: "Design", priority: "High", done: true },
        { id: 2, title: "Implement BLAK language extensions", category: "Core", priority: "High", done: true },
        { id: 3, title: "Rewrite ecosystem sample apps", category: "Apps", priority: "High", done: false },
        { id: 4, title: "Ship NovaOS update", category: "Release", priority: "Medium", done: false }
    ]
    newTask = ""
    newCategory = "General"
    newPriority = "Medium"
    filterCategory = "All"
    statusMessage = ""

    completedCount() {
        count = 0
        for t in tasks {
            if t.done {
                count = count + 1
            }
        }
        return count
    }

    addTask() {
        if newTask == "" {
            statusMessage = "Please type a task title"
            return
        }
        item = {
            id: length(tasks) + 1,
            title: newTask,
            category: newCategory,
            priority: newPriority,
            done: false
        }
        add(tasks, item)
        newTask = ""
        statusMessage = "Task added!"
    }

    toggleTask(taskTitle) {
        for t in tasks {
            if t.title == taskTitle {
                t.done = not t.done
            }
        }
    }

    deleteTask(taskTitle) {
        remove(tasks, taskTitle)
        statusMessage = "Task deleted"
    }

    saveTasks() {
        lines = []
        for t in tasks {
            status = "[ ] "
            if t.done {
                status = "[x] "
            }
            add(lines, status + t.title + " (" + t.category + ", " + t.priority + ")")
        }
        save "tasks.txt" {
            content = join(lines, "\\n")
        }
        statusMessage = "Saved to tasks.txt at " + system.time()
    }

    clearCompleted() {
        remaining = []
        for t in tasks {
            if not t.done {
                add(remaining, t)
            }
        }
        tasks = remaining
        statusMessage = "Cleared completed tasks"
    }

    window "To-do" {
        size 540, 660
        title "Task Master"

        column {
            gap 14

            row {
                gap 10
                avatar "✅", 40
                column {
                    gap 2
                    heading "Task Master"
                    subtitle "Organize, prioritize & track your daily work"
                }
                spacer 1
                badge string(completedCount()) + " of " + string(length(tasks)) + " done" {
                    color accent
                }
            }

            card {
                column {
                    gap 6
                    row {
                        text "Daily Progress" {
                            bold true
                            text_size 12
                        }
                        spacer 1
                        if completedCount() == length(tasks) {
                            badge "ALL DONE! 🎉" {
                                color success
                            }
                        }
                    }
                    progress completedCount(), max(1, length(tasks))
                }
            }

            card {
                column {
                    gap 10
                    subtitle "NEW TASK"

                    input newTask {
                        placeholder "What needs to be done?"
                    }

                    row {
                        gap 10
                        select newCategory {
                            option "General"
                            option "Core"
                            option "Design"
                            option "Apps"
                            option "Release"
                        }
                        select newPriority {
                            option "High"
                            option "Medium"
                            option "Low"
                        }
                        spacer 1
                        button "+ Add Task" {
                            variant primary
                            addTask()
                        }
                    }
                }
            }

            row {
                gap 8
                button "All" {
                    variant secondary
                    filterCategory = "All"
                }
                button "Core" {
                    variant secondary
                    filterCategory = "Core"
                }
                button "Design" {
                    variant secondary
                    filterCategory = "Design"
                }
                button "Apps" {
                    variant secondary
                    filterCategory = "Apps"
                }
                spacer 1
                button "Save File" {
                    variant ghost
                    saveTasks()
                }
                button "Clean" {
                    variant ghost
                    clearCompleted()
                }
            }

            if statusMessage != "" {
                text statusMessage {
                    color success
                    text_size 11
                }
            }

            scrollbox {
                gap 8
                max_height 280

                for t in tasks {
                    if filterCategory == "All" or t.category == filterCategory {
                        card {
                            row {
                                gap 12
                                button "✓" {
                                    if t.done {
                                        variant primary
                                    } else {
                                        variant secondary
                                    }
                                    toggleTask(t.title)
                                }

                                column {
                                    gap 2
                                    if t.done {
                                        text t.title {
                                            color muted
                                            text_size 13
                                        }
                                    } else {
                                        text t.title {
                                            bold true
                                            text_size 13
                                        }
                                    }
                                    row {
                                        gap 6
                                        badge t.category {
                                            color accent
                                        }
                                        if t.priority == "High" {
                                            badge "High Priority" {
                                                color danger
                                            }
                                        }
                                    }
                                }

                                spacer 1

                                button "×" {
                                    variant ghost
                                    deleteTask(t.title)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
`;

const TIP = `app "Tip Split" {
    bill = "85.00"
    tipPercent = 18
    diners = 3
    roundUp = true
    currencySymbol = "$"

    calculateTip(total, percent) {
        return round(total * percent) / 100
    }

    calculateTotal(total, tip) {
        return total + tip
    }

    calculatePerPerson(totalWithTip, people) {
        if people <= 0 {
            return 0
        }
        raw = totalWithTip / people
        if roundUp {
            return ceil(raw)
        }
        return round(raw * 100) / 100
    }

    window "Tip Split" {
        size 520, 620
        title "Tip & Bill Splitter"

        column {
            gap 14

            row {
                gap 10
                avatar "🧾", 40
                column {
                    gap 2
                    heading "Smart Bill Splitter"
                    subtitle "Instant per-person calculator & tip optimizer"
                }
                spacer 1
                badge currencySymbol {
                    color accent
                }
            }

            baseBill = number(bill)
            tipAmount = calculateTip(baseBill, tipPercent)
            grandTotal = calculateTotal(baseBill, tipAmount)
            eachPays = calculatePerPerson(grandTotal, diners)

            card {
                column {
                    gap 8
                    align center
                    subtitle "EACH PERSON PAYS"

                    text currencySymbol + string(eachPays) {
                        text_size 52
                        bold true
                        color success
                        align center
                    }

                    row {
                        gap 12
                        text "Bill: " + currencySymbol + string(baseBill) {
                            color muted
                            text_size 12
                        }
                        text "·" {
                            color muted
                        }
                        text "Tip: " + currencySymbol + string(tipAmount) {
                            color muted
                            text_size 12
                        }
                        text "·" {
                            color muted
                        }
                        text "Total: " + currencySymbol + string(grandTotal) {
                            color muted
                            text_size 12
                        }
                    }
                }
            }

            card {
                column {
                    gap 12
                    subtitle "BILL & CURRENCY"

                    row {
                        gap 10
                        input bill {
                            placeholder "Total bill amount"
                            type number
                        }
                        select currencySymbol {
                            option "$"
                            option "€"
                            option "£"
                            option "₦"
                            option "¥"
                        }
                    }

                    subtitle "SELECT TIP PERCENTAGE"

                    row {
                        gap 8
                        button "10%" {
                            if tipPercent == 10 {
                                variant primary
                            } else {
                                variant secondary
                            }
                            tipPercent = 10
                        }
                        button "15%" {
                            if tipPercent == 15 {
                                variant primary
                            } else {
                                variant secondary
                            }
                            tipPercent = 15
                        }
                        button "18%" {
                            if tipPercent == 18 {
                                variant primary
                            } else {
                                variant secondary
                            }
                            tipPercent = 18
                        }
                        button "20%" {
                            if tipPercent == 20 {
                                variant primary
                            } else {
                                variant secondary
                            }
                            tipPercent = 20
                        }
                        button "25%" {
                            if tipPercent == 25 {
                                variant primary
                            } else {
                                variant secondary
                            }
                            tipPercent = 25
                        }
                    }

                    divider

                    row {
                        gap 10
                        subtitle "NUMBER OF DINERS"
                        spacer 1
                        button "−" {
                            variant secondary
                            if diners > 1 {
                                diners = diners - 1
                            }
                        }
                        text string(diners) + " people" {
                            bold true
                            text_size 14
                        }
                        button "+" {
                            variant secondary
                            diners = diners + 1
                        }
                    }

                    toggle "Round up to whole currency unit", roundUp
                }
            }

            card {
                row {
                    gap 12
                    avatar "👥", 32
                    column {
                        gap 2
                        text "Split among " + string(diners) + " party members" {
                            bold true
                            text_size 12
                        }
                        subtitle "Calculated with " + string(tipPercent) + "% gratuity"
                    }
                    spacer 1
                    badge currencySymbol + string(eachPays) + " / person" {
                        color success
                    }
                }
            }
        }
    }
}
`;

const CONVERTER = `app "Converter" {
    category = "Temperature"
    inputVal = "100"
    resultVal = ""
    unitFrom = "Celsius"
    unitTo = "Fahrenheit"

    cToF(c) {
        return round((c * 9 / 5 + 32) * 10) / 10
    }

    fToC(f) {
        return round(((f - 32) * 5 / 9) * 10) / 10
    }

    kmToMiles(km) {
        return round((km * 0.621371) * 100) / 100
    }

    milesToKm(miles) {
        return round((miles * 1.60934) * 100) / 100
    }

    kgToLbs(kg) {
        return round((kg * 2.20462) * 100) / 100
    }

    lbsToKg(lbs) {
        return round((lbs * 0.453592) * 100) / 100
    }

    usdToEur(usd) {
        return round((usd * 0.92) * 100) / 100
    }

    eurToUsd(eur) {
        return round((eur * 1.087) * 100) / 100
    }

    calculate() {
        val = number(inputVal)
        if category == "Temperature" {
            if unitFrom == "Celsius" {
                return string(cToF(val)) + " °F"
            }
            return string(fToC(val)) + " °C"
        }
        if category == "Distance" {
            if unitFrom == "Kilometers" {
                return string(kmToMiles(val)) + " miles"
            }
            return string(milesToKm(val)) + " km"
        }
        if category == "Weight" {
            if unitFrom == "Kilograms" {
                return string(kgToLbs(val)) + " lbs"
            }
            return string(lbsToKg(val)) + " kg"
        }
        if category == "Currency" {
            if unitFrom == "USD" {
                return "€" + string(usdToEur(val))
            }
            return "$" + string(eurToUsd(val))
        }
        return "0"
    }

    swapUnits() {
        temp = unitFrom
        unitFrom = unitTo
        unitTo = temp
    }

    window "Converter" {
        size 520, 600
        title "Universal Converter"

        column {
            gap 14

            row {
                gap 10
                avatar "🔄", 40
                column {
                    gap 2
                    heading "Universal Unit Converter"
                    subtitle "Real-time multidirectional conversion"
                }
                spacer 1
                badge category {
                    color accent
                }
            }

            row {
                gap 8
                button "Temperature" {
                    if category == "Temperature" {
                        variant primary
                    } else {
                        variant secondary
                    }
                    category = "Temperature"
                    unitFrom = "Celsius"
                    unitTo = "Fahrenheit"
                    inputVal = "25"
                }
                button "Distance" {
                    if category == "Distance" {
                        variant primary
                    } else {
                        variant secondary
                    }
                    category = "Distance"
                    unitFrom = "Kilometers"
                    unitTo = "Miles"
                    inputVal = "42"
                }
                button "Weight" {
                    if category == "Weight" {
                        variant primary
                    } else {
                        variant secondary
                    }
                    category = "Weight"
                    unitFrom = "Kilograms"
                    unitTo = "Pounds"
                    inputVal = "75"
                }
                button "Currency" {
                    if category == "Currency" {
                        variant primary
                    } else {
                        variant secondary
                    }
                    category = "Currency"
                    unitFrom = "USD"
                    unitTo = "EUR"
                    inputVal = "100"
                }
            }

            card {
                column {
                    gap 8
                    align center
                    subtitle "CONVERTED RESULT"

                    text calculate() {
                        text_size 44
                        bold true
                        color success
                        align center
                    }

                    text inputVal + " " + unitFrom + " = " + calculate() {
                        color muted
                        text_size 12
                    }
                }
            }

            card {
                column {
                    gap 12
                    subtitle "VALUE & UNITS"

                    input inputVal {
                        placeholder "Enter amount..."
                        type number
                    }

                    row {
                        gap 12
                        badge unitFrom {
                            color accent
                        }
                        button "⇄ Swap" {
                            variant secondary
                            swapUnits()
                        }
                        badge unitTo {
                            color info
                        }
                    }

                    divider

                    subtitle "QUICK PRESETS"

                    row {
                        gap 8
                        if category == "Temperature" {
                            button "0°C (Freezing)" {
                                variant secondary
                                inputVal = "0"
                            }
                            button "21°C (Room)" {
                                variant secondary
                                inputVal = "21"
                            }
                            button "100°C (Boiling)" {
                                variant secondary
                                inputVal = "100"
                            }
                        }
                        if category == "Distance" {
                            button "5K Run" {
                                variant secondary
                                inputVal = "5"
                            }
                            button "Marathon (42.2K)" {
                                variant secondary
                                inputVal = "42.195"
                            }
                        }
                        if category == "Weight" {
                            button "50 kg" {
                                variant secondary
                                inputVal = "50"
                            }
                            button "80 kg" {
                                variant secondary
                                inputVal = "80"
                            }
                        }
                        if category == "Currency" {
                            button "$50" {
                                variant secondary
                                inputVal = "50"
                            }
                            button "$500" {
                                variant secondary
                                inputVal = "500"
                            }
                        }
                    }
                }
            }
        }
    }
}
`;

const WIKI = `app "Wiki Peek" {
    permission network

    topic = "Operating system"
    searchQuery = ""
    readingMode = false

    window "Wiki Peek" {
        size 580, 640
        title "Wiki Peek & Reader"

        column {
            gap 14

            row {
                gap 10
                avatar "🌐", 40
                column {
                    gap 2
                    heading "Wikipedia Explorer"
                    subtitle "Live articles & instant knowledge lookup"
                }
                spacer 1
                badge topic {
                    color accent
                }
            }

            card {
                column {
                    gap 10

                    input searchQuery {
                        placeholder "Search encyclopedia topics (e.g. Quantum, Mars, Linux)..."
                    }

                    row {
                        gap 8
                        button "Search" {
                            variant primary
                            if searchQuery != "" {
                                topic = searchQuery
                            }
                        }
                        button "AI" {
                            variant secondary
                            topic = "Artificial intelligence"
                        }
                        button "Space" {
                            variant secondary
                            topic = "Space exploration"
                        }
                        button "Physics" {
                            variant secondary
                            topic = "Quantum mechanics"
                        }
                        button "Architecture" {
                            variant secondary
                            topic = "Modern architecture"
                        }
                    }
                }
            }

            url = "https://en.wikipedia.org/w/rest.php/v1/search/page?q=" + encode(topic) + "&limit=6"
            result = get url

            row {
                text "Articles matching \\"" + topic + "\\"" {
                    bold true
                    text_size 13
                }
                spacer 1
                if result {
                    badge string(length(result.pages)) + " articles" {
                        color success
                    }
                }
            }

            scrollbox {
                gap 10
                max_height 340

                if result {
                    for page in result.pages {
                        card {
                            column {
                                gap 6
                                row {
                                    avatar page.title, 32
                                    column {
                                        gap 2
                                        text page.title {
                                            bold true
                                            text_size 15
                                        }
                                        if page.description {
                                            text page.description {
                                                color muted
                                                text_size 12
                                            }
                                        }
                                    }
                                }
                                divider
                                row {
                                    badge "Wikipedia Entry" {
                                        color accent
                                    }
                                    spacer 1
                                    link "Open in Browser ↗", "https://en.wikipedia.org/wiki/" + page.key
                                }
                            }
                        }
                    }
                }
                else {
                    card {
                        column {
                            gap 8
                            align center
                            avatar "⏳", 36
                            subtitle "Querying Wikipedia Knowledge Base..."
                        }
                    }
                }
            }
        }
    }
}
`;

const HABITS = `app "Habits" {
    permission files
    permission notifications

    habits = [
        { name: "Drink 2L Water", category: "Health", streak: 5, done: true },
        { name: "30 Min Morning Workout", category: "Fitness", streak: 4, done: true },
        { name: "Read 25 Pages", category: "Mind", streak: 12, done: false },
        { name: "Code Studio Project", category: "Work", streak: 7, done: true },
        { name: "Meditate 10 Minutes", category: "Mind", streak: 3, done: false }
    ]
    newHabitName = ""
    newHabitCategory = "Health"
    filterTag = "All"
    statusText = ""

    completedHabitsCount() {
        count = 0
        for h in habits {
            if h.done {
                count = count + 1
            }
        }
        return count
    }

    addHabit() {
        if newHabitName == "" {
            statusText = "Enter a habit name"
            return
        }
        item = {
            name: newHabitName,
            category: newHabitCategory,
            streak: 1,
            done: false
        }
        add(habits, item)
        newHabitName = ""
        statusText = "Habit added!"
    }

    toggleHabit(hName) {
        for h in habits {
            if h.name == hName {
                h.done = not h.done
                if h.done {
                    h.streak = h.streak + 1
                    notify "Awesome! Completed: " + h.name
                } else {
                    if h.streak > 0 {
                        h.streak = h.streak - 1
                    }
                }
            }
        }
    }

    saveStreak() {
        lines = []
        for h in habits {
            mark = "Pending"
            if h.done {
                mark = "Done"
            }
            add(lines, h.name + " | " + mark + " | Streak: " + string(h.streak))
        }
        save "habits.txt" {
            content = join(lines, "\\n")
        }
        statusText = "Saved streak data to habits.txt!"
        notify "Habit progress recorded to disk"
    }

    resetDay() {
        for h in habits {
            h.done = false
        }
        statusText = "Day reset for fresh tracking"
    }

    window "Habits" {
        size 540, 660
        title "Daily Habits & Streaks"

        column {
            gap 14

            row {
                gap 10
                avatar "🌱", 40
                column {
                    gap 2
                    heading "Habit & Streak Tracker"
                    subtitle "Build consistency day by day"
                }
                spacer 1
                badge string(completedHabitsCount()) + " / " + string(length(habits)) + " Completed" {
                    color success
                }
            }

            doneCount = completedHabitsCount()
            totalCount = length(habits)

            card {
                column {
                    gap 6
                    row {
                        text "Today's Completion" {
                            bold true
                            text_size 13
                        }
                        spacer 1
                        if doneCount == totalCount {
                            badge "PERFECT DAY 🔥" {
                                color success
                            }
                        } else {
                            badge string(totalCount - doneCount) + " remaining" {
                                color muted
                            }
                        }
                    }
                    progress doneCount, max(1, totalCount)
                }
            }

            card {
                column {
                    gap 10
                    subtitle "CREATE NEW HABIT"

                    input newHabitName {
                        placeholder "e.g. Write journal entry, Stretch..."
                    }

                    row {
                        gap 10
                        select newHabitCategory {
                            option "Health"
                            option "Fitness"
                            option "Mind"
                            option "Work"
                        }
                        spacer 1
                        button "+ Create Habit" {
                            variant primary
                            addHabit()
                        }
                    }
                }
            }

            row {
                gap 8
                button "All" {
                    variant secondary
                    filterTag = "All"
                }
                button "Health" {
                    variant secondary
                    filterTag = "Health"
                }
                button "Fitness" {
                    variant secondary
                    filterTag = "Fitness"
                }
                button "Mind" {
                    variant secondary
                    filterTag = "Mind"
                }
                spacer 1
                button "Save File" {
                    variant ghost
                    saveStreak()
                }
                button "Reset Day" {
                    variant ghost
                    resetDay()
                }
            }

            if statusText != "" {
                text statusText {
                    color success
                    text_size 11
                }
            }

            scrollbox {
                gap 8
                max_height 260

                for h in habits {
                    if filterTag == "All" or h.category == filterTag {
                        card {
                            row {
                                gap 12
                                button "✓" {
                                    if h.done {
                                        variant primary
                                    } else {
                                        variant secondary
                                    }
                                    toggleHabit(h.name)
                                }

                                column {
                                    gap 2
                                    if h.done {
                                        text h.name {
                                            color muted
                                            text_size 13
                                        }
                                    } else {
                                        text h.name {
                                            bold true
                                            text_size 13
                                        }
                                    }
                                    row {
                                        gap 6
                                        badge h.category {
                                            color accent
                                        }
                                        badge string(h.streak) + " day streak 🔥" {
                                            color warning
                                        }
                                    }
                                }

                                spacer 1

                                if h.done {
                                    badge "COMPLETED" {
                                        color success
                                    }
                                } else {
                                    badge "TO DO" {
                                        color muted
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
`;

const MONEY = `app "Money" {
    permission files
    permission notifications

    balance = 148500
    monthlyBudget = 200000
    savingsGoal = 500000
    currencySymbol = "$"
    selectedCategory = "All"
    searchQuery = ""
    viewTab = "Dashboard"

    transactions = [
        { id: 1, name: "Consulting Retainer", amount: 185000, type: "income", category: "Work", date: "Today", note: "Monthly client retainer" },
        { id: 2, name: "Whole Foods Market", amount: 14250, type: "expense", category: "Food", date: "Today", note: "Weekly organic groceries" },
        { id: 3, name: "Nova Fiber Internet", amount: 6500, type: "expense", category: "Bills", date: "Yesterday", note: "Gigabit connection" },
        { id: 4, name: "Cloud Server Hosting", amount: 12000, type: "expense", category: "Work", date: "Sep 2", note: "Production infrastructure" },
        { id: 5, name: "Cinema & Dinner", amount: 8900, type: "expense", category: "Entertainment", date: "Aug 31", note: "Weekend outing" },
        { id: 6, name: "Metro Transit Card", amount: 4500, type: "expense", category: "Transport", date: "Aug 29", note: "Monthly transit pass" }
    ]

    categories = ["Food", "Transport", "Bills", "Entertainment", "Shopping", "Work", "Health"]

    totalIncome() {
        total = 0
        for t in transactions {
            if t.type == "income" {
                total = total + t.amount
            }
        }
        return total
    }

    totalExpenses() {
        total = 0
        for t in transactions {
            if t.type == "expense" {
                total = total + t.amount
            }
        }
        return total
    }

    formatMoney(amount) {
        return currencySymbol + string(amount)
    }

    budgetSpentPercent() {
        expenses = totalExpenses()
        if monthlyBudget <= 0 {
            return 0
        }
        return round((expenses / monthlyBudget) * 100)
    }

    savingsPercent() {
        if savingsGoal <= 0 {
            return 0
        }
        return min(100, round((balance / savingsGoal) * 100))
    }

    saveLedger() {
        lines = []
        for t in transactions {
            add(lines, t.date + " | " + t.name + " | " + t.type + " | " + string(t.amount) + " | " + t.category)
        }
        save "money_ledger.txt" {
            content = join(lines, "\\n")
        }
        notify "Ledger saved to money_ledger.txt"
    }

    newName = ""
    newAmount = ""
    newType = "expense"
    newCategory = "Food"
    newNote = ""

    addTransaction() {
        if newName == "" or newAmount == "" {
            notify "Please fill name and amount"
            return
        }
        amt = number(newAmount)
        if amt <= 0 {
            notify "Amount must be greater than zero"
            return
        }

        item = {
            id: length(transactions) + 1,
            name: newName,
            amount: amt,
            type: newType,
            category: newCategory,
            date: "Today",
            note: newNote
        }
        add(transactions, item)

        if newType == "income" {
            balance = balance + amt
            notify "Income recorded: +" + formatMoney(amt)
        } else {
            balance = balance - amt
            notify "Expense logged: -" + formatMoney(amt)
        }

        newName = ""
        newAmount = ""
        newNote = ""
    }

    window "Money" {
        size 920, 680
        title "Money — Financial Command Center"

        column {
            gap 14

            row {
                gap 12
                avatar "💰", 44
                column {
                    gap 2
                    heading "Nova Finance Engine"
                    subtitle "Personal budget, category analytics & live ledger"
                }
                spacer 1
                row {
                    gap 8
                    button "Dashboard" {
                        if viewTab == "Dashboard" {
                            variant primary
                        } else {
                            variant secondary
                        }
                        viewTab = "Dashboard"
                    }
                    button "Transactions" {
                        if viewTab == "Transactions" {
                            variant primary
                        } else {
                            variant secondary
                        }
                        viewTab = "Transactions"
                    }
                    button "Analytics" {
                        if viewTab == "Analytics" {
                            variant primary
                        } else {
                            variant secondary
                        }
                        viewTab = "Analytics"
                    }
                    button "+ Record" {
                        variant primary
                        open "Add Transaction"
                    }
                }
            }

            divider

            row {
                gap 12

                card {
                    column {
                        gap 6
                        subtitle "NET LIQUID BALANCE"
                        text formatMoney(balance) {
                            text_size 24
                            bold true
                            color accent
                        }
                        row {
                            gap 6
                            badge "Goal: " + formatMoney(savingsGoal) {
                                color success
                            }
                            text string(savingsPercent()) + "% saved" {
                                color muted
                                text_size 11
                            }
                        }
                        progress savingsPercent(), 100
                    }
                }

                card {
                    column {
                        gap 6
                        subtitle "MONTHLY INFLOW"
                        text "+" + formatMoney(totalIncome()) {
                            text_size 24
                            bold true
                            color success
                        }
                        badge "Active period" {
                            color success
                        }
                    }
                }

                card {
                    column {
                        gap 6
                        subtitle "TOTAL EXPENSES"
                        text "-" + formatMoney(totalExpenses()) {
                            text_size 24
                            bold true
                            color danger
                        }
                        badge string(budgetSpentPercent()) + "% of budget" {
                            color warning
                        }
                    }
                }

                card {
                    column {
                        gap 6
                        subtitle "BUDGET CAP"
                        text formatMoney(monthlyBudget) {
                            text_size 24
                            bold true
                        }
                        progress budgetSpentPercent(), 100
                    }
                }
            }

            if viewTab == "Dashboard" or viewTab == "Analytics" {
                card {
                    column {
                        gap 10
                        row {
                            heading "Category Breakdown"
                            spacer 1
                            badge "Live Visualizer" {
                                color accent
                            }
                        }

                        chart {
                            type bar
                            data transactions
                            value "amount"
                            label "category"
                        }
                    }
                }
            }

            if viewTab == "Dashboard" or viewTab == "Transactions" {
                card {
                    column {
                        gap 12
                        row {
                            heading "Transaction History"
                            spacer 1
                            input searchQuery {
                                placeholder "Search transactions..."
                            }
                        }

                        row {
                            gap 6
                            button "All" {
                                if selectedCategory == "All" {
                                    variant primary
                                } else {
                                    variant secondary
                                }
                                selectedCategory = "All"
                            }
                            for cat in categories {
                                button cat {
                                    if selectedCategory == cat {
                                        variant primary
                                    } else {
                                        variant secondary
                                    }
                                    selectedCategory = cat
                                }
                            }
                            spacer 1
                            button "Save Ledger" {
                                variant ghost
                                saveLedger()
                            }
                        }

                        divider

                        scrollbox {
                            gap 8
                            max_height 230

                            for t in transactions {
                                if selectedCategory == "All" or t.category == selectedCategory {
                                    if searchQuery == "" or contains(t.name, searchQuery) {
                                        card {
                                            row {
                                                gap 12
                                                if t.type == "income" {
                                                    avatar "📈", 32
                                                } else {
                                                    avatar "📉", 32
                                                }

                                                column {
                                                    gap 2
                                                    text t.name {
                                                        bold true
                                                        text_size 13
                                                    }
                                                    row {
                                                        gap 6
                                                        badge t.category {
                                                            color accent
                                                        }
                                                        text t.note {
                                                            color muted
                                                            text_size 11
                                                        }
                                                    }
                                                }

                                                spacer 1

                                                column {
                                                    gap 2
                                                    align right
                                                    if t.type == "income" {
                                                        text "+" + formatMoney(t.amount) {
                                                            bold true
                                                            color success
                                                            text_size 14
                                                            align right
                                                        }
                                                    } else {
                                                        text "-" + formatMoney(t.amount) {
                                                            bold true
                                                            color danger
                                                            text_size 14
                                                            align right
                                                        }
                                                    }
                                                    text t.date {
                                                        color muted
                                                        text_size 11
                                                        align right
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    window "Add Transaction" {
        size 460, 540
        title "Record Transaction"

        column {
            gap 14

            row {
                gap 10
                avatar "💳", 36
                column {
                    gap 2
                    heading "New Transaction"
                    subtitle "Log cashflow to update your real-time ledger"
                }
            }

            card {
                column {
                    gap 10

                    input newName {
                        placeholder "Description (e.g. Salary, Coffee, Flight)"
                    }

                    input newAmount {
                        placeholder "Amount (e.g. 50, 1500)"
                        type number
                    }

                    input newNote {
                        placeholder "Optional notes or tags..."
                    }

                    row {
                        gap 10
                        select newType {
                            option "expense"
                            option "income"
                        }
                        select newCategory {
                            option "Food"
                            option "Transport"
                            option "Bills"
                            option "Entertainment"
                            option "Shopping"
                            option "Work"
                            option "Health"
                        }
                    }

                    divider

                    row {
                        button "Cancel" {
                            variant ghost
                            close
                        }
                        spacer 1
                        button "Add to Ledger" {
                            variant primary
                            addTransaction()
                            close
                        }
                    }
                }
            }
        }
    }
}
`;

export const BLAK_SAMPLES: BlakSample[] = [
  {
    slug: "hello-world",
    name: "Hello World",
    icon: "👋",
    color: "bg-sky-500",
    author: "NovaOS",
    version: "2.0.0",
    description:
      "Interactive NovaOS system dashboard demonstrating custom UI components, health metrics, live toggles, and system notifications.",
    permissions: [],
    rating: 4.8,
    reviews: 142,
    source: HELLO,
  },
  {
    slug: "counter",
    name: "Counter",
    icon: "🔢",
    color: "bg-indigo-500",
    author: "NovaOS",
    version: "2.0.0",
    description:
      "Goal-oriented tally counter with live progress tracking, streak multiplier, history timeline, and system goal notifications.",
    permissions: ["notifications"],
    rating: 4.7,
    reviews: 98,
    source: COUNTER,
  },
  {
    slug: "greeter",
    name: "Greeter",
    icon: "🙋",
    color: "bg-emerald-500",
    author: "NovaOS",
    version: "2.0.0",
    description:
      "Desktop messaging and notification studio. Format greetings in different tones and broadcast real desktop notifications.",
    permissions: ["notifications"],
    rating: 4.6,
    reviews: 85,
    source: GREETER,
  },
  {
    slug: "todo",
    name: "To-do",
    icon: "✅",
    color: "bg-amber-500",
    author: "NovaOS",
    version: "2.0.0",
    description:
      "Comprehensive task and workflow manager with categories, priority tags, progress bars, task toggling, and file persistence.",
    permissions: ["files"],
    rating: 4.9,
    reviews: 215,
    source: TODO,
  },
  {
    slug: "tip-split",
    name: "Tip Split",
    icon: "🧾",
    color: "bg-teal-500",
    author: "NovaOS",
    version: "2.0.0",
    description:
      "Smart restaurant bill and tip calculator. Select gratuity percentages, split equally across party members, and round totals.",
    permissions: [],
    rating: 4.7,
    reviews: 130,
    source: TIP,
  },
  {
    slug: "converter",
    name: "Converter",
    icon: "🌡️",
    color: "bg-rose-500",
    author: "NovaOS",
    version: "2.0.0",
    description:
      "Universal unit converter supporting Temperature, Distance, Weight, and Currency with instant two-way conversion and quick presets.",
    permissions: [],
    rating: 4.8,
    reviews: 114,
    source: CONVERTER,
  },
  {
    slug: "wiki-peek",
    name: "Wiki Peek",
    icon: "🌐",
    color: "bg-violet-500",
    author: "NovaOS",
    version: "2.0.0",
    description:
      "Instant Wikipedia explorer with live network search, topic chips, article preview cards, and one-click browser links.",
    permissions: ["network"],
    rating: 4.9,
    reviews: 165,
    source: WIKI,
  },
  {
    slug: "habits",
    name: "Habits",
    icon: "🌱",
    color: "bg-lime-500",
    author: "NovaOS",
    version: "2.0.0",
    description:
      "Daily habit tracker with streak counters, completion progress, daily reset, milestone badges, and filesystem storage.",
    permissions: ["files", "notifications"],
    rating: 4.8,
    reviews: 147,
    source: HABITS,
  },
  {
    slug: "money",
    name: "Money",
    icon: "💰",
    color: "bg-emerald-600",
    author: "NovaOS",
    version: "2.0.0",
    description:
      "Command center for personal finances with category charts, budget progress, transaction filtering, and ledger management.",
    permissions: ["files", "notifications"],
    rating: 4.9,
    reviews: 260,
    source: MONEY,
  },
];

export const STARTER_TEMPLATE = HELLO;
