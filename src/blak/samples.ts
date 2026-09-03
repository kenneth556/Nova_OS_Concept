/**
 * Sample BLAK programs. They are the App Store catalogue and double as the
 * templates offered by Code Studio.
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
    window "Main" {
        size 380, 220
        title "Hello World"

        column {
            text "Hello World 👋"
            text_size 22

            text "This whole app is written in BLAK."
        }
    }
}
`;

const COUNTER = `app "Counter" {
    count = 0

    window "Counter" {
        size 340, 240

        column {
            text "Count"
            text count

            row {
                button "Add one" {
                    count = count + 1
                }

                button "Reset" {
                    count = 0
                }
            }
        }
    }
}
`;

const GREETER = `app "Greeter" {
    permission notifications

    window "Greeter" {
        size 400, 260

        column {
            text "What is your name?"
            input person

            button "Say hello" {
                show "Hello " + person + "!"
                notify "Greeted " + person
            }
        }
    }
}
`;

const TODO = `app "To-do" {
    permission files

    items = ["Buy milk", "Finish NovaOS"]

    window "To-do" {
        size 420, 420

        column {
            text "My list"
            text_size 20

            for item in items {
                card {
                    text item
                }
            }

            input newItem

            row {
                button "Add" {
                    add(items, newItem)
                }

                button "Save to file" {
                    save "todo.txt" {
                        content = join(items, "\\n")
                    }
                    show "Saved " + length(items) + " items"
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

    window "Converter" {
        size 400, 260

        column {
            text "Celsius to Fahrenheit"
            input celsius

            button "Convert" {
                show celsius + "C is " + round(toFahrenheit(number(celsius))) + "F"
            }
        }
    }
}
`;

const WIKI = `app "Wiki Peek" {
    permission network

    window "Wiki Peek" {
        size 520, 400

        column {
            text "Wikipedia results for: operating system"
            text_size 18

            result = get "https://en.wikipedia.org/w/rest.php/v1/search/page?q=operating%20system&limit=4"

            if result {
                for page in result.pages {
                    card {
                        text page.title
                        text page.description
                    }
                }
            }
            else {
                text "Loading from the web..."
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
    version: "1.0.0",
    description: "The smallest possible BLAK app: one window, two lines of text.",
    permissions: [],
    source: HELLO,
  },
  {
    slug: "counter",
    name: "Counter",
    icon: "🔢",
    color: "bg-indigo-500",
    author: "NovaOS",
    version: "1.0.0",
    description: "Buttons, variables and live updates. Shows how state works in BLAK.",
    permissions: [],
    source: COUNTER,
  },
  {
    slug: "greeter",
    name: "Greeter",
    icon: "🙋",
    color: "bg-emerald-500",
    author: "NovaOS",
    version: "1.0.0",
    description: "Reads an input field and raises a real system notification.",
    permissions: ["notifications"],
    source: GREETER,
  },
  {
    slug: "todo",
    name: "To-do",
    icon: "✅",
    color: "bg-amber-500",
    author: "NovaOS",
    version: "1.1.0",
    description: "Lists, loops and saving to a real file in your filesystem.",
    permissions: ["files"],
    source: TODO,
  },
  {
    slug: "converter",
    name: "Converter",
    icon: "🌡️",
    color: "bg-rose-500",
    author: "NovaOS",
    version: "1.0.0",
    description: "Functions with a return value, wired to an input and a button.",
    permissions: [],
    source: CONVERTER,
  },
  {
    slug: "wiki-peek",
    name: "Wiki Peek",
    icon: "🌐",
    color: "bg-violet-500",
    author: "NovaOS",
    version: "1.0.0",
    description: "Fetches live data from the web with get and loops over the result.",
    permissions: ["network"],
    source: WIKI,
  },
];

export const STARTER_TEMPLATE = HELLO;
