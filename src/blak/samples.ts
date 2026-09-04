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
}

const HELLO = `app "Hello World" {
    window "Hello World" {
        size 420, 400
        title "Hello World"

        column {
            gap 14

            heading "Hello World 👋"

            subtitle "Every pixel of this window was described in BLAK — no HTML, no CSS, no JavaScript."

            badge "BLAK v1" {
                color accent
            }

            divider

            card {
                column {
                    gap 6
                    text "Try editing me" {
                        bold true
                    }
                    subtitle "Open Code Studio, change a line, and press Run. Your app reopens instantly."
                }
            }

            row {
                button "Open Code Studio" {
                    open "Code Studio"
                }

                button "Nice" {
                    variant ghost
                    show "Glad you like it."
                }
            }
        }
    }
}
`;

const COUNTER = `app "Counter" {
    count = 0

    window "Counter" {
        size 380, 400

        column {
            gap 12
            align center

            subtitle "Tap to count"

            text count {
                text_size 64
                bold true
                color accent
                align center
            }

            row {
                button "−  One" {
                    variant secondary
                    count = count - 1
                }

                button "+  One" {
                    count = count + 1
                }
            }

            spacer 4

            if count > 9 {
                badge "Double digits" {
                    color success
                }
            }

            if count < 0 {
                badge "Below zero" {
                    color warning
                }
            }

            button "Reset" {
                variant ghost
                count = 0
            }
        }
    }
}
`;

const GREETER = `app "Greeter" {
    permission notifications

    greeting = ""

    window "Greeter" {
        size 440, 420

        column {
            gap 14

            heading "Say hello"
            subtitle "Type a name, then send yourself a real system notification."

            input person

            row {
                button "Greet" {
                    if person == "" {
                        greeting = "Type a name first."
                    }
                    else {
                        greeting = "Hello " + person + "! 👋"
                        notify greeting
                    }
                }

                button "Clear" {
                    variant ghost
                    person = ""
                    greeting = ""
                }
            }

            if greeting != "" {
                card {
                    column {
                        gap 4
                        badge "Notification sent" {
                            color success
                        }
                        text greeting {
                            text_size 17
                            bold true
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

    items = ["Design the icon", "Ship NovaOS"]
    saved = ""

    window "To-do" {
        size 460, 520

        column {
            gap 12

            row {
                heading "My list"
                badge length(items) {
                    color accent
                }
            }

            subtitle "Lists, loops and a real file on your filesystem."

            input newItem

            row {
                button "Add task" {
                    if newItem != "" {
                        add(items, newItem)
                        newItem = ""
                    }
                }

                button "Save to file" {
                    variant secondary
                    save "todo.txt" {
                        content = join(items, "\\n")
                    }
                    saved = "Saved " + length(items) + " tasks to todo.txt"
                }

                button "Clear all" {
                    variant ghost
                    items = []
                    saved = ""
                }
            }

            if saved != "" {
                badge saved {
                    color success
                }
            }

            divider

            if length(items) == 0 {
                subtitle "Nothing left to do. Add a task above."
            }

            for item in items {
                card {
                    row {
                        badge "•" {
                            color accent
                        }
                        text item
                    }
                }
            }
        }
    }
}
`;

const TIP = `app "Tip Split" {
    perPerson(total, tipPercent, people) {
        if people < 1 {
            return 0
        }
        withTip = total + total * tipPercent / 100
        return withTip / people
    }

    money(value) {
        return round(value * 100) / 100
    }

    window "Tip Split" {
        size 440, 500

        column {
            gap 12

            heading "Split the bill"
            subtitle "Functions, maths and live results as you type."

            input bill
            input people
            input tip

            divider

            total = number(bill)
            heads = number(people)
            percent = number(tip)

            if heads < 1 {
                heads = 1
            }

            card {
                column {
                    gap 6

                    subtitle "Each person pays"

                    text money(perPerson(total, percent, heads)) {
                        text_size 40
                        bold true
                        color success
                    }

                    divider

                    text "Bill " + money(total) + "  ·  Tip " + percent + "%  ·  " + heads + " people" {
                        color muted
                    }

                    text "Tip amount " + money(total * percent / 100) {
                        color muted
                    }
                }
            }

            row {
                button "10%" {
                    variant secondary
                    tip = "10"
                }
                button "15%" {
                    variant secondary
                    tip = "15"
                }
                button "20%" {
                    variant secondary
                    tip = "20"
                }
            }
        }
    }
}
`;

const CONVERTER = `app "Converter" {
    toFahrenheit(c) {
        return c * 9 / 5 + 32
    }

    toCelsius(f) {
        return (f - 32) * 5 / 9
    }

    window "Converter" {
        size 420, 460

        column {
            gap 12

            heading "Temperature"
            subtitle "One function each way, wired straight to the fields."

            input celsius

            card {
                column {
                    gap 4
                    subtitle "Fahrenheit"
                    text round(toFahrenheit(number(celsius))) + "°F" {
                        text_size 32
                        bold true
                        color warning
                    }
                }
            }

            input fahrenheit

            card {
                column {
                    gap 4
                    subtitle "Celsius"
                    text round(toCelsius(number(fahrenheit))) + "°C" {
                        text_size 32
                        bold true
                        color info
                    }
                }
            }

            row {
                button "Freezing" {
                    variant secondary
                    celsius = "0"
                    fahrenheit = "32"
                }
                button "Body heat" {
                    variant secondary
                    celsius = "37"
                    fahrenheit = "98.6"
                }
                button "Boiling" {
                    variant secondary
                    celsius = "100"
                    fahrenheit = "212"
                }
            }
        }
    }
}
`;

const WIKI = `app "Wiki Peek" {
    permission network

    topic = "operating system"

    window "Wiki Peek" {
        size 560, 540

        column {
            gap 12

            heading "Wiki Peek"
            subtitle "Live results straight from Wikipedia, looped over in four lines of BLAK."

            row {
                button "Operating systems" {
                    variant secondary
                    topic = "operating system"
                }
                button "Compilers" {
                    variant secondary
                    topic = "compiler"
                }
                button "Space" {
                    variant secondary
                    topic = "spaceflight"
                }
            }

            badge topic {
                color accent
            }

            divider

            url = "https://en.wikipedia.org/w/rest.php/v1/search/page?q=" + encode(topic) + "&limit=5"
            result = get url

            if result {
                for page in result.pages {
                    card {
                        column {
                            gap 4
                            text page.title {
                                bold true
                                text_size 15
                            }
                            subtitle page.description
                            link "Read on Wikipedia", "https://en.wikipedia.org/wiki/" + page.key
                        }
                    }
                }
            }
            else {
                card {
                    subtitle "Fetching from the web…"
                }
            }
        }
    }
}
`;

const HABITS = `app "Habits" {
    permission files
    permission notifications

    habits = ["Drink water", "Read 20 pages", "Walk outside"]
    done = []

    window "Habits" {
        size 440, 520

        column {
            gap 12

            row {
                heading "Today"
                badge length(done) + " / " + length(habits) {
                    color accent
                }
            }

            subtitle "Tap a habit to mark it done. Streaks save to a real file."

            divider

            for habit in habits {
                card {
                    row {
                        if contains(done, habit) {
                            badge "Done" {
                                color success
                            }
                        }
                        else {
                            badge "To do" {
                                color muted
                            }
                        }

                        text habit

                        button "Mark" {
                            variant ghost
                            if contains(done, habit) {
                                show habit + " was already done"
                            }
                            else {
                                add(done, habit)
                                notify "Nice work: " + habit
                            }
                        }
                    }
                }
            }

            spacer 4

            if length(done) == length(habits) {
                card {
                    column {
                        gap 4
                        badge "All clear" {
                            color success
                        }
                        text "Every habit done today. 🎉" {
                            bold true
                        }
                    }
                }
            }

            row {
                button "Save streak" {
                    save "habits.txt" {
                        content = join(done, "\\n")
                    }
                    show "Saved to habits.txt"
                }

                button "Reset day" {
                    variant ghost
                    done = []
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
    version: "1.1.0",
    description:
      "The smallest complete BLAK app: a heading, a card and two buttons. Start here to see how the language maps to a real window.",
    permissions: [],
    source: HELLO,
  },
  {
    slug: "counter",
    name: "Counter",
    icon: "🔢",
    color: "bg-indigo-500",
    author: "NovaOS",
    version: "1.1.0",
    description:
      "Variables, buttons and live updates. The number redraws itself after every tap, and badges appear as the count crosses thresholds.",
    permissions: [],
    source: COUNTER,
  },
  {
    slug: "greeter",
    name: "Greeter",
    icon: "🙋",
    color: "bg-emerald-500",
    author: "NovaOS",
    version: "1.1.0",
    description:
      "Reads an input field, validates it, and raises a real system notification you'll see in the notification centre.",
    permissions: ["notifications"],
    source: GREETER,
  },
  {
    slug: "todo",
    name: "To-do",
    icon: "✅",
    color: "bg-amber-500",
    author: "NovaOS",
    version: "1.2.0",
    description:
      "Lists, loops, and saving to a genuine file in your filesystem. Open todo.txt in Notepad afterwards to prove it.",
    permissions: ["files"],
    source: TODO,
  },
  {
    slug: "tip-split",
    name: "Tip Split",
    icon: "🧾",
    color: "bg-teal-500",
    author: "NovaOS",
    version: "1.0.0",
    description:
      "A bill splitter that recalculates as you type. Shows functions with return values, arithmetic, and preset buttons writing back into fields.",
    permissions: [],
    source: TIP,
  },
  {
    slug: "converter",
    name: "Converter",
    icon: "🌡️",
    color: "bg-rose-500",
    author: "NovaOS",
    version: "1.1.0",
    description:
      "Converts temperature both ways at once, with preset buttons. Two functions, two cards, no glue code.",
    permissions: [],
    source: CONVERTER,
  },
  {
    slug: "wiki-peek",
    name: "Wiki Peek",
    icon: "🌐",
    color: "bg-violet-500",
    author: "NovaOS",
    version: "1.1.0",
    description:
      "Fetches live search results from Wikipedia with get, loops over them into cards, and links each one into the NovaOS browser.",
    permissions: ["network"],
    source: WIKI,
  },
  {
    slug: "habits",
    name: "Habits",
    icon: "🌱",
    color: "bg-lime-500",
    author: "NovaOS",
    version: "1.0.0",
    description:
      "A daily habit tracker: conditional badges inside a loop, notifications when you complete one, and streaks written to disk.",
    permissions: ["files", "notifications"],
    source: HABITS,
  },
];

export const STARTER_TEMPLATE = HELLO;
