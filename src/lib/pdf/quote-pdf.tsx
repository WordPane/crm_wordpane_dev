import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { Quote, QuoteItem } from "@/lib/db/schema";
import {
  formatCurrency,
  formatDate,
  formatQuoteNumber,
} from "@/lib/utils/format";
import { quoteStatusLabels } from "@/lib/validations/quote";

/** Dados já formatados para o documento (server-side apenas). */
export type QuotePdfInput = {
  quote: Quote;
  items: QuoteItem[];
  company: {
    name: string;
    cnpj: string | null;
    email: string | null;
    personType: "pj" | "pf";
  };
};

const GREEN = "#00b359";
const INK = "#111827";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: INK,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  brand: { fontSize: 18, fontWeight: "bold", color: GREEN },
  brandSub: { fontSize: 8, color: MUTED, marginTop: 2 },
  docTitle: { fontSize: 14, fontWeight: "bold", textAlign: "right" },
  docMeta: { fontSize: 9, color: MUTED, textAlign: "right", marginTop: 2 },
  draftBanner: {
    backgroundColor: "#fef3c7",
    color: "#92400e",
    padding: 8,
    borderRadius: 4,
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 8,
    fontWeight: "bold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  row: { flexDirection: "row" },
  col: { flex: 1 },
  label: { color: MUTED, fontSize: 8 },
  value: { fontSize: 10, marginTop: 1 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 8,
    fontWeight: "bold",
    color: MUTED,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  colDesc: { flex: 4 },
  colQty: { flex: 1, textAlign: "right" },
  colPrice: { flex: 1.5, textAlign: "right" },
  colTotal: { flex: 1.5, textAlign: "right" },
  totals: { marginTop: 12, alignItems: "flex-end" },
  totalRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 2 },
  totalLabel: { width: 120, textAlign: "right", color: MUTED, paddingRight: 12 },
  totalValue: { width: 110, textAlign: "right" },
  grandTotalLabel: {
    width: 120,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "bold",
    paddingRight: 12,
  },
  grandTotalValue: {
    width: 110,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "bold",
    color: GREEN,
  },
  notes: {
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 10,
    fontSize: 9,
    lineHeight: 1.5,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: MUTED,
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
});

function formatQuantity(quantity: string): string {
  return Number(quantity).toLocaleString("pt-BR");
}

function QuotePdfDocument({ quote, items, company }: QuotePdfInput) {
  const number = formatQuoteNumber(quote.number);
  const subtotalCents = quote.totalCents + quote.discountCents;

  return (
    <Document title={`Orçamento ${number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>WordPane</Text>
            <Text style={styles.brandSub}>CRM — Gestão de projetos</Text>
          </View>
          <View>
            <Text style={styles.docTitle}>ORÇAMENTO {number}</Text>
            <Text style={styles.docMeta}>
              Emitido em {formatDate(quote.createdAt)}
            </Text>
            <Text style={styles.docMeta}>
              Válido até {formatDate(quote.validUntil)}
            </Text>
            <Text style={styles.docMeta}>
              Status: {quoteStatusLabels[quote.status]}
            </Text>
          </View>
        </View>

        {quote.status === "draft" && (
          <View style={styles.draftBanner}>
            <Text>RASCUNHO — ESTE ORÇAMENTO AINDA NÃO FOI ENVIADO AO CLIENTE</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>
          <Text style={styles.value}>{company.name}</Text>
          {company.cnpj && (
            <Text style={styles.label}>
              {company.personType === "pf" ? "CPF" : "CNPJ"}: {company.cnpj}
            </Text>
          )}
          {company.email && (
            <Text style={styles.label}>{company.email}</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Referência</Text>
          <Text style={styles.value}>{quote.title}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.tableHeader} fixed>
            <Text style={styles.colDesc}>DESCRIÇÃO</Text>
            <Text style={styles.colQty}>QTD.</Text>
            <Text style={styles.colPrice}>VALOR UNIT.</Text>
            <Text style={styles.colTotal}>TOTAL</Text>
          </View>
          {items.map((item) => (
            <View style={styles.tableRow} key={item.id} wrap={false}>
              <Text style={styles.colDesc}>{item.description}</Text>
              <Text style={styles.colQty}>{formatQuantity(item.quantity)}</Text>
              <Text style={styles.colPrice}>
                {formatCurrency(item.unitPriceCents)}
              </Text>
              <Text style={styles.colTotal}>
                {formatCurrency(item.totalCents)}
              </Text>
            </View>
          ))}

          <View style={styles.totals}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Subtotal</Text>
              <Text style={styles.totalValue}>
                {formatCurrency(subtotalCents)}
              </Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Desconto</Text>
              <Text style={styles.totalValue}>
                − {formatCurrency(quote.discountCents)}
              </Text>
            </View>
            <View style={[styles.totalRow, { marginTop: 6 }]}>
              <Text style={styles.grandTotalLabel}>Total</Text>
              <Text style={styles.grandTotalValue}>
                {formatCurrency(quote.totalCents)}
              </Text>
            </View>
          </View>
        </View>

        {quote.notes && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Observações</Text>
            <View style={styles.notes}>
              <Text>{quote.notes}</Text>
            </View>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>
            Orçamento {number} gerado pelo WordPane CRM em{" "}
            {formatDate(new Date())}.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

/** Gera o PDF do orçamento em memória (Buffer) para o route handler. */
export async function renderQuotePdf(input: QuotePdfInput): Promise<Buffer> {
  return renderToBuffer(<QuotePdfDocument {...input} />);
}
