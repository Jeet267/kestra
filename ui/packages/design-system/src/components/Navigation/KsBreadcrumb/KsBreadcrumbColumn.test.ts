import {describe, test, expect} from "vitest"
import {flushPromises} from "@vue/test-utils"
import KsBreadcrumbColumn from "./KsBreadcrumbColumn.vue"
import locales from "./KsBreadcrumb.locale"
import type {KsBreadcrumbItem, KsBreadcrumbLoader} from "./types"
import {i18nMount} from "../../../../tests/units/i18nMount"

type ColumnProps = {entries?: KsBreadcrumbItem[]; load?: KsBreadcrumbLoader; heading?: string}

const mountColumn = (props: ColumnProps) => i18nMount(KsBreadcrumbColumn, {locales, props})

const rowLabels = (wrapper: ReturnType<typeof mountColumn>) =>
    wrapper.findAll("[data-testid=\"breadcrumb-entry\"]").map((row) => row.text())

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((settle) => {
        resolve = settle
    })
    return {promise, resolve}
}

describe("KsBreadcrumbColumn", () => {
    test("renders one row per entry and ignores load when entries are given", async () => {
        const wrapper = mountColumn({
            entries: [{label: "dev"}, {label: "prod"}],
            load: async () => [{label: "ignored"}],
        })
        await flushPromises()

        expect(rowLabels(wrapper)).toEqual(["dev", "prod"])
    })

    test("awaits the load function and renders its items", async () => {
        const wrapper = mountColumn({load: async () => [{label: "company"}, {label: "team"}]})
        await flushPromises()

        expect(rowLabels(wrapper)).toEqual(["company", "team"])
    })

    test("clears the previous rows as soon as load changes, before the new ones arrive", async () => {
        const wrapper = mountColumn({load: async () => [{label: "old"}]})
        await flushPromises()
        const next = deferred<KsBreadcrumbItem[]>()

        await wrapper.setProps({load: () => next.promise})
        expect(rowLabels(wrapper)).toEqual([])

        next.resolve([{label: "new"}])
        await flushPromises()
        expect(rowLabels(wrapper)).toEqual(["new"])
    })

    test("discards a slow loader that resolves after a newer one has started", async () => {
        const slow = deferred<KsBreadcrumbItem[]>()
        const wrapper = mountColumn({load: () => slow.promise})

        await wrapper.setProps({load: async () => [{label: "fresh"}]})
        await flushPromises()
        slow.resolve([{label: "stale"}])
        await flushPromises()

        expect(rowLabels(wrapper)).toEqual(["fresh"])
    })

    test("shows the empty message only once loading has finished with no rows", async () => {
        const pending = deferred<KsBreadcrumbItem[]>()
        const wrapper = mountColumn({load: () => pending.promise})
        await flushPromises()
        expect(wrapper.text()).not.toContain("Nothing here yet")

        pending.resolve([])
        await flushPromises()
        expect(wrapper.text()).toContain("Nothing here yet")
    })

    test("renders the heading only when one is passed", () => {
        const withHeading = mountColumn({entries: [{label: "dev"}], heading: "Namespaces"})
        const withoutHeading = mountColumn({entries: [{label: "dev"}]})

        expect(withHeading.text()).toContain("Namespaces")
        expect(withoutHeading.text()).toBe("dev")
    })

    test("opens the nested fly-out on a row with children and closes it on a row without", async () => {
        const wrapper = mountColumn({
            entries: [
                {label: "company", children: async () => [{label: "team"}]},
                {label: "flows"},
            ],
        })
        const [company, flows] = wrapper.findAll("[data-testid=\"breadcrumb-entry\"]")

        await company.trigger("mouseenter")
        await flushPromises()
        expect(rowLabels(wrapper)).toEqual(["company", "flows", "team"])

        await flows.trigger("mouseenter")
        expect(rowLabels(wrapper)).toEqual(["company", "flows"])
    })

    test("emits select with the clicked entry and bubbles up a nested fly-out's select", async () => {
        const team: KsBreadcrumbItem = {label: "team"}
        const company: KsBreadcrumbItem = {label: "company", children: async () => [team]}
        const wrapper = mountColumn({entries: [company]})
        const row = wrapper.find("[data-testid=\"breadcrumb-entry\"]")

        await row.trigger("click")
        expect(wrapper.emitted("select")?.at(-1)).toEqual([company])

        await row.trigger("mouseenter")
        await flushPromises()
        const nestedRow = wrapper.findAll("[data-testid=\"breadcrumb-entry\"]").find((entry) => entry.text() === "team")
        await nestedRow!.trigger("click")

        expect(wrapper.emitted("select")).toHaveLength(2)
        expect(wrapper.emitted("select")?.at(-1)).toEqual([team])
    })
})
