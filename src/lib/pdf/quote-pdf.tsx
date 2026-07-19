import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { Quote, QuoteItem } from "@/lib/db/schema";
import type { IssuerInfo } from "@/lib/issuer";
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
    /** Endereço completo em linha única (null quando não informado). */
    address: string | null;
    phone: string | null;
  };
  issuer: IssuerInfo;
  /** Logo oficial em data URI (lida do /public pelo route handler). */
  logoSrc: string;
};

const GREEN = "#00d164";
const DARK = "#071928";
const INK = "#111827";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

const styles = StyleSheet.create({
  page: {
    fontSize: 10,
    fontFamily: "Helvetica",
    color: INK,
    padding: 0,
  },
  header: {
    backgroundColor: DARK,
    paddingHorizontal: 36,
    paddingVertical: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: { height: 24, width: 185 },
  docTitle: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "right",
  },
  docMeta: {
    fontSize: 8.5,
    color: "rgba(255,255,255,0.6)",
    textAlign: "right",
    marginTop: 2,
  },
  body: { paddingHorizontal: 36, paddingTop: 24 },
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
  partiesRow: { flexDirection: "row", gap: 24, marginBottom: 16 },
  party: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    padding: 12,
  },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 8,
    fontWeight: "bold",
    color: GREEN,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  label: { color: MUTED, fontSize: 8.5, marginTop: 1.5, lineHeight: 1.4 },
  value: { fontSize: 10.5, fontWeight: "bold" },
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
    color: "#00b359",
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
    bottom: 20,
    left: 36,
    right: 36,
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

function QuotePdfDocument({
  quote,
  items,
  company,
  issuer,
  logoSrc,
}: QuotePdfInput) {
  const number = formatQuoteNumber(quote.number);
  const subtotalCents = quote.totalCents + quote.discountCents;

  return (
    <Document title={`Orçamento ${number}`}>
      <Page size="A4" style={styles.page}>
        {/* ─── Cabeçalho escuro com a logo oficial ─── */}
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf não usa alt */}
          <Image src={logoSrc} style={styles.logo} />
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

        <View style={styles.body}>
          {quote.status === "draft" && (
            <View style={styles.draftBanner}>
              <Text>
                RASCUNHO — ESTE ORÇAMENTO AINDA NÃO FOI ENVIADO AO CLIENTE
              </Text>
            </View>
          )}

          {/* ─── Emitente (WordPane) + Cliente ─── */}
          <View style={styles.partiesRow}>
            <View style={styles.party}>
              <Text style={styles.sectionTitle}>Emitente</Text>
              <Text style={styles.value}>{issuer.displayName}</Text>
              <Text style={styles.label}>{issuer.razaoSocial}</Text>
              <Text style={styles.label}>CNPJ: {issuer.cnpj}</Text>
              <Text style={styles.label}>{issuer.addressLine}</Text>
              <Text style={styles.label}>
                {issuer.email} · {issuer.phone}
              </Text>
            </View>
            <View style={styles.party}>
              <Text style={styles.sectionTitle}>Cliente</Text>
              <Text style={styles.value}>{company.name}</Text>
              {company.cnpj && (
                <Text style={styles.label}>
                  {company.personType === "pf" ? "CPF" : "CNPJ"}: {company.cnpj}
                </Text>
              )}
              {company.address && (
                <Text style={styles.label}>{company.address}</Text>
              )}
              {company.email && <Text style={styles.label}>{company.email}</Text>}
              {company.phone && <Text style={styles.label}>{company.phone}</Text>}
            </View>
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
                <Text style={styles.colQty}>
                  {formatQuantity(item.quantity)}
                </Text>
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
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {issuer.displayName} · {issuer.razaoSocial} · CNPJ {issuer.cnpj} ·{" "}
            {issuer.email}
          </Text>
          <Text>
            Orçamento {number} gerado em {formatDate(new Date())}
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
