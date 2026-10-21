import PublicInstrumentForm from '../../components/PublicInstrumentForm';

export const metadata = { title: 'Formulário | Painel Psico', referrer: 'no-referrer', robots: { index: false, follow: false } };

export default async function FormPage({ params }) {
  const { formSlug } = await params;
  return <PublicInstrumentForm slug={formSlug} />;
}
