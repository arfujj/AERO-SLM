# AeroSLM Sample Input Playbook

Use this playbook to test the AeroSLM diagnosis flow with a realistic CFD failure case.

## Upload File

Upload this file in the app:

```text
sample-inputs/transonic-outlet-backflow-divergence.log
```

## Form Inputs

Solver:

```text
ANSYS Fluent
```

Short case description:

```text
Transonic wing-body cruise case with wake recovery outlet placed close to the aft body.
```

Mesher setup:

```text
Poly-hexcore volume mesh
Prism layers around wing and fuselage
Curvature and proximity refinement enabled
```

Mesh setup:

```text
4.5 million cells
Target y+ near 1 on wing surfaces
Elevated skewness near wing-body junction
Wake region refined downstream of trailing edge
```

Refinement:

```text
Leading edge and trailing edge surface refinement
Wake volume refinement behind wing
Local refinement around wing-body junction
Outlet boundary near wake recovery region
```

Mach number:

```text
0.82
```

Turbulence model:

```text
k-omega SST
```

Physics model details:

```text
Compressible RANS
Density-based coupled solver
Steady-state pseudo-transient continuation
```

Boundary conditions:

```text
Pressure farfield inlet
Pressure outlet at farfield_outlet
No-slip adiabatic walls
Outlet is close to aft wake recovery
```

CFL Number:

```text
34
```

Simulation type:

```text
Pseudo-transient
```

Troubleshooting query:

```text
Why does the pressure correction diverge after the CFL ramp increases above 25, and is the outlet backflow related to the failure?
```

## Expected AeroSLM Behavior

A good diagnosis should identify:

- Diverging continuity and momentum residuals.
- CFL ramp becoming too aggressive.
- Outlet backflow appearing before the pressure correction failure.
- Possible outlet placement or pressure boundary mismatch.
- Possible mesh quality sensitivity near the wing-body junction.
- Need to reduce CFL/timestep aggressiveness before trusting any solution.

## Strong Next Action

The first recommendation should be to rerun from the last stable checkpoint with a reduced CFL ramp and inspect outlet placement/reverse-flow behavior before making broader turbulence model or mesh changes.
