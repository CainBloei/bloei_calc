import React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { format } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';
import type { RekenInput } from '../types';
import CurrencyInput from 'react-currency-input-field';
import { Controller } from 'react-hook-form';

const inputClass = "w-full p-2 border rounded bg-white dark:bg-[#000000] dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-bloei-petrol";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CurrencyField = ({ name, control, prefix = "€ ", decimalsLimit = 2 }: { name: any, control: any, prefix?: string, decimalsLimit?: number }) => (
  <Controller
    name={name}
    control={control}
    render={({ field: { onChange, value, name } }) => (
      <CurrencyInput
        id={name}
        name={name}
        // Als de waarde 0 is, maken we het veld leeg zodat de nul niet in de weg zit.
        value={value === 0 ? '' : value}
        // ...maar we tonen wel een nette placeholder zodat de gebruiker snapt dat leeg "0" betekent.
        placeholder={`${prefix}0`} 
        allowNegativeValue={false} 
        decimalsLimit={decimalsLimit}
        onValueChange={(val) => onChange(val === undefined ? 0 : Number(val))}
        prefix={prefix}
        groupSeparator="."
        decimalSeparator=","
        className={inputClass}
        // Zodra je in het veld klikt, selecteert hij direct álle tekst. 
        // Begin je met typen? Dan overschrijf je alles in één keer schoon!
        onFocus={(e) => e.target.select()}
      />
    )}
  />
);

// Simplified Yup schema since we trust our defaults more and validation happens on backend as well.
const schema = yup.object({
  startvermogen: yup.number().min(0).required(),
  profiel: yup.string().oneOf(['Defensief', 'Matig defensief', 'Neutraal', 'Offensief', 'Zeer offensief', 'Niet beleggen'] as const).required(),
  startdatum: yup.string().required(),
  horizon_jaren: yup.number().min(0).max(60).required(),
  n_scenarios: yup.number().min(1).max(10000).default(5000),
  periodieke_storting_maandelijks: yup.number().min(0).default(0),
  periodieke_onttrekking_maandelijks: yup.number().min(0).default(0),
  periodieke_storting_startdatum: yup.string().optional().nullable().transform((v, o) => o === '' ? null : v),
  periodieke_storting_einddatum: yup.string().optional().nullable().transform((v, o) => o === '' ? null : v),
  periodieke_onttrekking_startdatum: yup.string().optional().nullable().transform((v, o) => o === '' ? null : v),
  periodieke_onttrekking_einddatum: yup.string().optional().nullable().transform((v, o) => o === '' ? null : v),
  eenmalige_cashflows: yup.array().of(
    yup.object({
      bedrag: yup.number().min(0).max(1e12).required(),
      datum: yup.string().required(),
      type: yup.string().oneOf(['storting', 'onttrekking'] as const).required(),
    })
  ).max(500).default([]),
  afbouw_profiel: yup.boolean().default(false),
  is_bloei_plus: yup.boolean().default(false),
  rng_seed: yup.number().default(42),
}).required();

interface SidebarProps {
  onCalculate: (data: RekenInput) => void;
  isLoading: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ onCalculate, isLoading }) => {
  const { register, control, handleSubmit, watch, formState: { errors } } = useForm<RekenInput>({
    resolver: yupResolver(schema) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    defaultValues: {
      startvermogen: 100000,
      profiel: 'Zeer offensief',
      startdatum: format(new Date(), 'yyyy-MM-dd'),
      horizon_jaren: 15,
      n_scenarios: 5000,
      periodieke_storting_maandelijks: 0,
      periodieke_onttrekking_maandelijks: 0,
      eenmalige_cashflows: [],
      afbouw_profiel: false,
      is_bloei_plus: false,
      rng_seed: 42,
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "eenmalige_cashflows"
  });

  const watchPeriodiekeStorting = watch('periodieke_storting_maandelijks');
  const watchPeriodiekeOnttrekking = watch('periodieke_onttrekking_maandelijks');
  const watchIsBloeiPlus = watch('is_bloei_plus');

  const onSubmit = (data: RekenInput) => {
    onCalculate(data);
  };

  const labelClass = "block text-sm font-medium mb-1 dark:text-gray-300";

  return (
    <div className="w-90 bg-gray-50 dark:bg-neutral-950 border-r dark:border-neutral-800 h-screen overflow-y-auto flex flex-col">
      <div className="p-4 bg-bloei-petrol text-white shrink-0 dark:text-gray-300">
        <h1 className="text-xl font-bold">Bloei Rekenmodule</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-6 flex-1">
        
        {/* Basisinvoer */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-bloei-petrol dark:text-bloei-petrol border-b pb-2">Basisinvoer</h2>
          
          <div>
            <label className={labelClass}>Startvermogen (€)</label>
            <CurrencyField name="startvermogen" control={control} />
            {errors.startvermogen && <span className="text-red-500 text-xs">{errors.startvermogen.message}</span>}
          </div>

          <div>
            <label className={labelClass}>Beleggingsprofiel</label>
            <select {...register('profiel')} className={`${inputClass} cursor-pointer`}>
              <option value="Niet beleggen">Niet beleggen</option>
              <option value="Defensief">Defensief</option>
              <option value="Matig defensief">Matig defensief</option>
              <option value="Neutraal">Neutraal</option>
              <option value="Offensief">Offensief</option>
              <option value="Zeer offensief">Zeer offensief</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Startdatum</label>
            <input type="date" {...register('startdatum')} className={`${inputClass} cursor-pointer`} />
          </div>

          <div>
            <label className={labelClass}>Horizon (jaren)</label>
            <CurrencyField name="horizon_jaren" control={control} prefix="" decimalsLimit={0} />
          </div>
          
          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              id="afbouw_profiel"
              {...register('afbouw_profiel')}
              className="rounded text-bloei-petrol focus:ring-bloei-petrol cursor-pointer"
            />
            <label
              htmlFor="afbouw_profiel"
              className="text-sm dark:text-gray-300 cursor-pointer"
            >
              Profiel automatisch afbouwen?
            </label>
          </div>

          {/* Custom Segmented Toggle voor Dienstverlening */}
          <div className="pt-4 border-t border-gray-200 dark:border-neutral-800">
            <label className="text-sm font-medium mb-3 block text-gray-900 dark:text-gray-300">
              Dienstverlening
            </label>
            
            <label className="relative flex p-1 bg-gray-200 dark:bg-neutral-800 rounded-full cursor-pointer select-none shadow-inner">
              {/* De onzichtbare checkbox */}
              <input
                type="checkbox"
                id="is_bloei_plus"
                {...register('is_bloei_plus')}
                className="sr-only peer"
              />
              
              {/* De schuivende gekleurde 'pill' */}
              <div className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-bloei-petrol rounded-full shadow-sm transition-transform duration-300 ease-in-out peer-checked:translate-x-full"></div>
              
              {/* Optie 1: Bloei Standaard */}
              <span className={`relative z-10 w-1/2 text-center text-sm py-1.5 font-medium transition-colors duration-300 ${
                !watchIsBloeiPlus 
                  ? 'text-white' 
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}>
                Bloei
              </span>
              
              {/* Optie 2: Bloei Plus */}
              <span className={`relative z-10 w-1/2 text-center text-sm py-1.5 font-medium transition-colors duration-300 ${
                watchIsBloeiPlus 
                  ? 'text-white' 
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
              }`}>
                Bloei Plus
              </span>
            </label>
          </div>
        </section>

        {/* Periodieke stortingen / onttrekkingen */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-bloei-petrol dark:text-bloei-petrol border-b pb-2">Periodieke stortingen / onttrekkingen</h2>
          
          <div>
            <label className={labelClass}>Maandelijkse Inleg (€)</label>
            <CurrencyField name="periodieke_storting_maandelijks" control={control} />
          </div>
          
          {watchPeriodiekeStorting > 0 && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Startdatum (optioneel)</label>
                <input
                  type="date"
                  {...register('periodieke_storting_startdatum')}
                  className={`${inputClass} cursor-pointer`}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Einddatum (optioneel)</label>
                <input
                  type="date"
                  {...register('periodieke_storting_einddatum')}
                  className={`${inputClass} cursor-pointer`}
                />
              </div>
            </div>
          )}

          <div>
            <label className={labelClass}>Maandelijkse Onttrekking (€)</label>
            <CurrencyField name="periodieke_onttrekking_maandelijks" control={control} />
          </div>
          
          {watchPeriodiekeOnttrekking > 0 && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Startdatum (optioneel)</label>
                <input
                  type="date"
                  {...register('periodieke_onttrekking_startdatum')}
                  className={`${inputClass} cursor-pointer`}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Einddatum (optioneel)</label>
                <input
                  type="date"
                  {...register('periodieke_onttrekking_einddatum')}
                  className={`${inputClass} cursor-pointer`}
                />
              </div>
            </div>
          )}
        </section>

        {/* Eenmalige Cashflows */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-lg font-semibold text-bloei-petrol dark:text-bloei-petrol">Eenmalig</h2>
            <button 
              type="button" 
              onClick={() => append({ bedrag: 0, datum: format(new Date(), 'yyyy-MM-dd'), type: 'storting' })}
              className="text-bloei-petrol hover:text-bloei-pink cursor-pointer"
            >
              <Plus size={20} />
            </button>
          </div>

          <div className="space-y-3">
            {fields.map((field, index) => (
              <div key={field.id} className="p-3 bg-white dark:bg-[#000000] rounded border dark:border-neutral-600 relative group">
                <button 
                  type="button" 
                  onClick={() => remove(index)}
                  className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={16} />
                </button>
                <div className="space-y-2 pr-6">
                  <div>
                    <label className="text-xs text-gray-500">Type</label>
                    <select {...register(`eenmalige_cashflows.${index}.type` as const)} className={`${inputClass} text-sm py-1`}>
                      <option value="storting">Storting</option>
                      <option value="onttrekking">Onttrekking</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Bedrag (€)</label>
                    <CurrencyField name={`eenmalige_cashflows.${index}.bedrag` as const} control={control} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Datum</label>
                    <input
                      type="date"
                      {...register(`eenmalige_cashflows.${index}.datum` as const)}
                      className={`${inputClass} text-sm py-1 cursor-pointer`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Simulatie Settings */}
        <section className="space-y-4 pt-4 border-t">
          <div>
            <label className={labelClass}>Scenarios</label>
            <CurrencyField name="n_scenarios" control={control} prefix="" decimalsLimit={0} />
          </div>
        </section>

        <button 
          type="submit" 
          disabled={isLoading}
          className="w-full py-3 bg-bloei-petrol hover:bg-bloei-pink text-white rounded font-bold shadow transition-colors disabled:opacity-50 mt-8 cursor-pointer disabled:cursor-not-allowed"
        >
          {isLoading ? 'Berekenen...' : 'Bereken resultaat'}
        </button>
      </form>
    </div>
  );
};
