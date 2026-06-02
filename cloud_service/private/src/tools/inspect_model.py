#!/usr/bin/env python3
"""
Inspect a Keras .h5 model file and print layer names and weight shapes.
Run inside your virtualenv:
python tools/inspect_model.py [path/to/model.h5]
"""
import sys
from pathlib import Path

try:
    import h5py
except Exception as e:
    print("Error: h5py not available in this Python environment:", e)
    sys.exit(2)


def inspect(path):
    p = Path(path)
    if not p.exists():
        print(f"Model file not found: {p}")
        return 1

    with h5py.File(p, 'r') as f:
        print(f"File: {p.resolve()}")
        # print top-level keys
        print("Top-level keys:", list(f.keys()))
        # keras metadata
        for attr in ['keras_version', 'backend', 'model_config']:
            if attr in f.attrs:
                print(f"Attr {attr}: {f.attrs[attr]}")

        # model_weights group
        if 'model_weights' in f:
            mw = f['model_weights']
            layers = list(mw.keys())
            print(f"\nmodel_weights layer groups ({len(layers)}):")
            for name in layers:
                group = mw[name]
                weight_names = list(group.keys())
                print(f" - {name}: {weight_names}")
        else:
            # older format: may have layer names in 'layer_names' dataset
            if 'layer_names' in f:
                try:
                    ln = list(f['layer_names'])
                    print('\nlayer_names:')
                    for n in ln:
                        try:
                            print(' -', n.decode('utf-8'))
                        except Exception:
                            print(' -', n)
                except Exception as e:
                    print('Could not read layer_names:', e)

        # Try to print model topology summary if available
        if 'model_config' in f.attrs:
            print('\nmodel_config present (truncated):')
            mc = f.attrs['model_config']
            try:
                print(str(mc)[:1000])
            except Exception:
                print(repr(mc)[:1000])

    return 0


if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'Entrenamineto_LSTM/embedding_network_mini.h5'
    sys.exit(inspect(path))
